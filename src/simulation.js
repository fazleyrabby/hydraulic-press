import { Vector3 } from 'three';

/**
 * Press state machine + force model. Generic: all object-specific behavior comes
 * from PressObject.forceAt()/targetCompression and optional definition hooks.
 */
const FREE_SPEED = 10;     // cm/s, ram travel with no load
const LOAD_SPEED = 3.5;    // cm/s, max ram travel while loaded
const RETRACT_SPEED = 12;  // cm/s
const RAMP_TIME = 2.6;     // s for hydraulic pressure to build to full capacity
const STALL_TIME = 0.5;    // s at full pressure without progress before overload
const STRAIN_TIME = 3.4;   // s of overload before catastrophic failure
const MIN_GAP = 0.4;       // closest plate-to-anvil approach, cm

export class Simulation {
  constructor(ctx, capacity) {
    this.ctx = ctx;
    this.capacity = capacity;
    this.state = 'idle';
    this.force = 0;
    this.P = 0;
    this.stall = 0;
    this.t = 0;
    this.outcome = null;
  }

  get press() { return this.ctx.press; }
  get subject() { return this.ctx.subject; }
  get busy() { return this.state !== 'idle' && this.state !== 'failed'; }

  start() {
    if (this.state !== 'idle') return;
    this.ctx.sound.init();
    this.state = 'descend';
    this.ctx.setCam('close');
    this._status('DESCENDING', `${this.subject.def.name} under ${this.capacity} t`);
  }

  _status(head, sub = '', cls = '') { this.ctx.setStatus(head, sub, cls); }

  /** Largest compression the current hydraulic pressure P can sustain (bisection; forceAt is monotonic). */
  _solve(P, lo, hi) {
    const s = this.subject;
    if (s.forceAt(hi) <= P) return hi;
    if (s.forceAt(lo) > P) return lo;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (s.forceAt(mid) <= P) lo = mid; else hi = mid;
    }
    return lo;
  }

  update(dt) {
    const { press, subject, sound, fx } = this.ctx;
    const top = press.anvilTop, H = subject.H, def = subject.def;
    let y = press.ramY;
    this.t += dt;

    switch (this.state) {
      case 'descend': {
        y -= FREE_SPEED * dt;
        const contact = subject.broken ? top + MIN_GAP : subject.topY;
        if (y <= contact) {
          y = contact;
          this.state = subject.broken ? 'hold' : 'load';
          this.P = 0; this.stall = 0; this.holdT = 0;
          sound.thud(0.7);
          fx.sparks(new Vector3(0, y, 0), 4, 60);
          def.onContact?.(this.ctx, subject);
        }
        sound.setHum(0.5, 0.1);
        break;
      }

      case 'load': {
        this.P = Math.min(this.capacity, this.P + (this.capacity / RAMP_TIME) * dt);
        const target = subject.targetCompression;
        const cStar = this._solve(this.P, subject.c, target);
        const cNext = Math.min(cStar, subject.c + (LOAD_SPEED * dt) / H);
        const advancing = cNext - subject.c > 1e-7;
        if (cNext > subject.c) subject.setCompression(cNext);
        this.force = subject.forceAt(subject.c);
        y = top + H * (1 - subject.c);
        sound.setHum(0.9, this.force / this.capacity);
        def.onLoad?.(this.ctx, subject, this.force, this.capacity);
        if (subject.behavior === 'ductile' && advancing && Math.random() < dt * 14) sound.crunch();
        this._status('LOADING', `${this.force.toFixed(this.force < 10 ? 2 : 1)} t`);

        if (subject.c >= target - 1e-6) {
          if (subject.behavior === 'brittle') {
            subject.shatter(this.ctx);
            this.outcome = { head: 'SHATTERED', sub: `${def.name} gave up at ${this.force.toFixed(1)} t`, cls: 'ok' };
            this.force = 0;
            this.state = 'follow';
          } else {
            this.state = 'hold';
            this.holdT = 0;
            this.outcome = subject.behavior === 'elastic'
              ? { head: 'BOING', sub: `${def.name} squished ${(subject.c * 100).toFixed(0)}% and bounced back`, cls: 'ok' }
              : { head: 'CRUSHED', sub: `${def.name} flattened by ${(subject.c * 100).toFixed(0)}%`, cls: 'ok' };
          }
        } else if (this.P >= this.capacity && !advancing) {
          this.stall += dt;
          if (this.stall > STALL_TIME) {
            this.state = 'strain';
            this.strainT = 0;
            press.beginStrain();
            def.onStrainStart?.(this.ctx, subject);
          }
        } else {
          this.stall = 0;
        }
        break;
      }

      case 'follow': {
        y -= FREE_SPEED * 1.5 * dt;
        if (y <= top + MIN_GAP) { y = top + MIN_GAP; this.state = 'hold'; this.holdT = 0; sound.thud(1); }
        sound.setHum(0.5, 0.1);
        break;
      }

      case 'hold': {
        this.holdT += dt;
        if (this.holdT > 0.9) {
          this.state = 'retract';
          if (subject.behavior === 'elastic') sound.boing();
          if (this.outcome) this._status(this.outcome.head, this.outcome.sub, this.outcome.cls);
        }
        break;
      }

      case 'retract': {
        this.force = Math.max(0, this.force - this.capacity * dt);
        y += RETRACT_SPEED * dt;
        sound.setHum(0.45, 0);
        if (y >= press.restY) {
          y = press.restY;
          this.state = 'idle';
          sound.setHum(0);
          this.ctx.setCam('wide');
          if (!this.outcome) this._status('READY');
        }
        break;
      }

      case 'strain': {
        this.strainT += dt;
        const k = Math.min(1, this.strainT / STRAIN_TIME);
        this.force = this.capacity * (1 + 0.1 * k + Math.sin(this.t * 40) * 0.015 * (1 + k * 3));
        press.updateStrain(k, dt, this.ctx);
        this.ctx.setShake(0.05 + k * k * 0.55);
        sound.setHum(1, 1 + k * 0.6);
        def.onStrain?.(this.ctx, subject, k);
        this._status('⚠ OVERLOAD', `${(this.force).toFixed(0)} t / ${this.capacity} t — ${def.name} is not moving`, 'warn');
        if (k >= 1) {
          press.explode(this.ctx);
          subject.drop(this.ctx);
          this.ctx.setShake(0);
          this.ctx.gauge.crack();
          this.ctx.setCam('chaos');
          sound.setHum(0);
          this.state = 'failed';
          this.force = 0;
          def.onPressFail?.(this.ctx, subject);
          this._status('✖ PRESS DESTROYED', def.failMessage || `${def.name} was stronger than ${this.capacity} t`, 'danger');
        }
        y = press.ramY;
        break;
      }

      case 'failed':
        break;
    }

    if (this.state !== 'failed' && this.state !== 'strain') press.setRam(y);
    press.update(dt, this.ctx);
    const free = !['load', 'hold'].includes(this.state) || subject.broken;
    subject.update(dt, press.ramY - top, free, this.ctx);
  }
}

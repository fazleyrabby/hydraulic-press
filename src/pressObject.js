import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Default material parameters per behavior. Forces are in metric tons.
 *
 *  rigid   – does not deform at all. Press capacity is never enough → press fails.
 *  ductile – yields at `yield` tons and flows plastically (crumples/barrels). Stays squashed.
 *  elastic – squishes like rubber, springs back when released.
 *  brittle – barely deforms, then shatters into fragments once `strength` is reached.
 *
 * If the press's capacity is lower than what the object needs, the press stalls,
 * overloads and destroys itself — regardless of behavior.
 */
export const BEHAVIORS = {
  rigid: { stiffness: 1e7 },
  ductile: { yield: 1, hardening: 0.8, densify: 6, maxCompression: 0.86, bulge: 0.35, crumple: 0.15, folds: 5, springBack: 0.03 },
  elastic: { stiffness: 2, maxCompression: 0.6, bounce: 1 },
  brittle: { strength: 5, breakStrain: 0.02, fragments: 45, fragmentShape: 'shard' },
};

export class PressObject {
  constructor(def) {
    this.def = def;
    this.mat = { ...BEHAVIORS[def.material.behavior], ...def.material };
    this.behavior = this.mat.behavior;

    this.built = def.build();
    this.built.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.built);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.built.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

    this.H = size.y;
    this.halfWidth = size.x / 2;
    this.halfDepth = size.z / 2;

    // model (base at y=0, centered) → inner (offset) → root (pivot at back-bottom edge, for tipping over)
    this.model = new THREE.Group();
    this.model.add(this.built);
    this.inner = new THREE.Group();
    this.inner.position.z = this.halfDepth;
    this.inner.add(this.model);
    this.root = new THREE.Group();
    this.root.add(this.inner);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    this.c = 0;      // current compression 0..1 (negative = stretched, elastic only)
    this.cMax = 0;   // max compression reached (plastic memory)
    this.v = 0;      // elastic spring velocity
    this.broken = false;
    this.meshes = [];
    if (this.behavior === 'ductile' || this.behavior === 'elastic') this._bake();
  }

  place(scene, baseY) {
    this.baseY = baseY;
    this.root.position.set(0, baseY, -this.halfDepth);
    scene.add(this.root);
  }

  /** Force (tons) the object pushes back with at compression c. Monotonic until failure. */
  forceAt(c) {
    const m = this.mat;
    switch (this.behavior) {
      case 'rigid': return m.stiffness * c;
      case 'elastic': return m.stiffness * Math.pow(Math.max(c, 0), 1.6);
      case 'brittle': return (m.strength * c) / m.breakStrain;
      case 'ductile': {
        const cy = 0.015;
        if (c < cy) return (m.yield * c) / cy;
        return m.yield * (1 + m.hardening * (c - cy)) + m.yield * m.densify * Math.pow(Math.max(0, c - 0.75) / 0.25, 3);
      }
    }
    return 0;
  }

  /** Compression the press will drive toward before holding. */
  get targetCompression() {
    switch (this.behavior) {
      case 'rigid': return 1;
      case 'brittle': return this.mat.breakStrain;
      default: return this.mat.maxCompression;
    }
  }

  /** Force the press must reach to "win". Used for UI only. */
  get requiredForce() {
    if (this.behavior === 'rigid') return Infinity;
    if (this.behavior === 'brittle') return this.mat.strength;
    if (this.behavior === 'ductile') return this.mat.yield;
    return this.forceAt(this.mat.maxCompression);
  }

  /** Height of the object's top surface right now. */
  get topY() {
    if (this.broken) return this.baseY;
    return this.baseY + this.H * (1 - Math.max(0, this.c));
  }

  // --- deformation ---------------------------------------------------------

  /** Flatten every mesh into model space so we can deform vertices uniformly. */
  _bake() {
    this.model.updateMatrixWorld(true);
    const inv = this.model.matrixWorld.clone().invert();
    const meshes = [];
    this.model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      m.geometry = m.geometry.clone().applyMatrix4(rel);
      m.position.set(0, 0, 0);
      m.quaternion.identity();
      m.scale.set(1, 1, 1);
      this.model.add(m);
      m.userData.orig = m.geometry.attributes.position.array.slice();
      this.meshes.push(m);
    }
  }

  setCompression(c) {
    this.c = c;
    this.cMax = Math.max(this.cMax, c);
    if (!this.meshes.length) return;
    const H = this.H, s = 1 - c, m = this.mat;
    for (const mesh of this.meshes) {
      const o = mesh.userData.orig;
      const pos = mesh.geometry.attributes.position;
      const a = pos.array;
      for (let i = 0; i < a.length; i += 3) {
        const x0 = o[i], y0 = o[i + 1], z0 = o[i + 2];
        const u = clamp(y0 / H, 0, 1);
        let r, y = y0 * s;
        if (this.behavior === 'elastic') {
          r = 1 + (1 / Math.sqrt(Math.max(s, 0.05)) - 1) * (0.5 + 0.5 * Math.sin(Math.PI * u));
        } else {
          const ang = Math.atan2(z0, x0);
          const cc = Math.max(c, 0);
          const fold = Math.sin(u * Math.PI * 2 * m.folds + ang * 3) * 0.6 + Math.sin(ang * 5 + y0 * 0.9 + x0 * 0.7) * 0.4;
          r = 1 + cc * m.bulge * Math.sin(Math.PI * u) + cc * cc * m.crumple * fold;
          y += cc * H * 0.04 * m.crumple * Math.sin(ang * 4 + u * 9);
        }
        a[i] = x0 * r;
        a[i + 1] = y;
        a[i + 2] = z0 * r;
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
  }

  // --- per-frame -------------------------------------------------------------

  /** Called every frame. `gap` is the distance between the press plate and the anvil. `free` = press not actively loading. */
  update(dt, gap, free, ctx) {
    if (this.dropping) return this._updateDrop(dt, ctx);
    if (this.broken || !free) return;
    const plateC = 1 - gap / this.H; // compression forced by plate position
    if (this.behavior === 'elastic') {
      const k = 350 * this.mat.bounce, d = 9;
      this.v += (-k * this.c - d * this.v) * dt;
      let c = this.c + this.v * dt;
      if (c < plateC) { c = plateC; this.v = Math.max(this.v, 0); }
      if (Math.abs(c) > 1e-4 || Math.abs(this.v) > 1e-3) this.setCompression(c);
    } else if (this.behavior === 'ductile') {
      const rest = Math.max(0, this.cMax - this.mat.springBack);
      const target = Math.max(rest, plateC);
      if (Math.abs(this.c - target) > 1e-4) {
        const cm = this.cMax;
        this.setCompression(this.c + (target - this.c) * Math.min(1, dt * 10));
        this.cMax = cm;
      }
    }
  }

  // --- failure modes ---------------------------------------------------------

  shatter(ctx) {
    if (this.def.shatter) return this.def.shatter(ctx, this);
    this.broken = true;
    const { debris, fx, scene } = ctx;
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    let material;
    this.model.traverse((o) => { if (!material && o.isMesh) material = Array.isArray(o.material) ? o.material[0] : o.material; });
    const n = this.mat.fragments;
    const unit = Math.cbrt((size.x * size.y * size.z) / n);
    for (let i = 0; i < n; i++) {
      const geo = this.mat.fragmentShape === 'shard'
        ? new THREE.TetrahedronGeometry(unit * rand(0.5, 1.1))
        : new THREE.DodecahedronGeometry(unit * rand(0.35, 0.7));
      geo.scale(rand(0.6, 1.4), rand(0.3, 1.1), rand(0.6, 1.4));
      const frag = new THREE.Mesh(geo, material);
      frag.position.set(
        center.x + rand(-0.5, 0.5) * size.x,
        box.min.y + rand(0.05, 0.9) * size.y,
        center.z + rand(-0.5, 0.5) * size.z
      );
      frag.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      scene.add(frag);
      const out = frag.position.clone().sub(center).setY(0).normalize();
      debris.add(frag, out.multiplyScalar(rand(80, 420)).add(new THREE.Vector3(0, rand(-40, 180), 0)),
        new THREE.Vector3(rand(-25, 25), rand(-25, 25), rand(-25, 25)), { bounce: 0.35, owned: true });
    }
    fx.dust(center, 40, this.mat.dustColor || [0.85, 0.9, 0.95], 140);
    fx.sparks(center, 20, 200);
    this.root.visible = false;
    ctx.sound.shatter();
    ctx.shake(0.8);
  }

  /** Fall off a destroyed press and tip over (face up) if tall and thin. */
  drop(ctx) {
    this.dropping = { vy: 60, phase: 'fall', ang: 0, w: 0, ground: ctx.groundAt(0, 0) };
  }

  _updateDrop(dt, ctx) {
    const d = this.dropping, r = this.root;
    if (d.phase === 'fall') {
      d.vy -= 981 * dt;
      r.position.y += d.vy * dt;
      if (r.position.y <= d.ground) {
        r.position.y = d.ground;
        ctx.sound.thud(0.4);
        if (Math.abs(d.vy) > 60) d.vy = -d.vy * 0.25;
        else d.phase = this.H > this.halfDepth * 2 * 1.3 ? 'tip' : 'rest';
      }
    } else if (d.phase === 'tip') {
      d.w += 18 * Math.sin(d.ang + 0.15) * dt;
      d.ang += d.w * dt;
      if (d.ang >= Math.PI / 2) {
        d.ang = Math.PI / 2;
        if (d.w > 0.8) { d.w = -d.w * 0.25; ctx.sound.thud(0.3); }
        else d.phase = 'rest';
      }
      r.rotation.x = -d.ang;
    } else if (d.phase === 'rest' && !d.landed) {
      d.landed = true;
      this.def.onLanded?.(ctx, this);
    }
  }
}

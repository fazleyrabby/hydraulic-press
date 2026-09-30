const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
};
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
};

/** Analog pressure gauge (SVG). Needle sweeps -135°…+135°. */
export class Gauge {
  constructor(host) {
    this.svg = el('svg', { viewBox: '0 0 200 200' }, host);
    const defs = el('defs', {}, this.svg);
    const bez = el('linearGradient', { id: 'bez', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#f4f5f7' }, bez);
    el('stop', { offset: 1, 'stop-color': '#7d828a' }, bez);
    el('circle', { cx: 100, cy: 100, r: 98, fill: 'url(#bez)' }, this.svg);
    el('circle', { cx: 100, cy: 100, r: 88, fill: '#f7f5ee', stroke: '#222', 'stroke-width': 1.5 }, this.svg);
    this.scale = el('g', {}, this.svg);
    this.readout = el('text', { x: 100, y: 146, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, 'font-family': 'ui-monospace, Menlo, monospace', fill: '#111' }, this.svg);
    el('text', { x: 100, y: 128, 'text-anchor': 'middle', 'font-size': 9, 'letter-spacing': 2, fill: '#555', 'font-family': 'sans-serif' }, this.svg).textContent = 'TONS';
    this.needle = el('g', {}, this.svg);
    el('polygon', { points: '97,104 103,104 100.6,22 99.4,22', fill: '#c1121f' }, this.needle);
    el('circle', { cx: 100, cy: 100, r: 7, fill: '#222' }, this.svg);
    el('circle', { cx: 100, cy: 100, r: 2.5, fill: '#999' }, this.svg);
    this.cracks = el('g', { stroke: '#fff', 'stroke-width': 1.3, fill: 'none', opacity: 0 }, this.svg);
    for (const d of ['M100 100 L60 40 L48 30', 'M100 100 L150 70 L178 64', 'M100 100 L120 160 L128 186', 'M100 100 L40 120 L14 118', 'M60 40 L70 20', 'M150 70 L160 44', 'M120 160 L150 170']) {
      el('path', { d }, this.cracks);
    }
    el('circle', { cx: 100, cy: 100, r: 88, fill: 'rgba(255,255,255,0.08)', stroke: 'none' }, this.svg);
    this.value = 0;
    this.shown = 0;
    this.setCapacity(100);
  }

  setCapacity(cap) {
    this.cap = cap;
    this.scale.innerHTML = '';
    const [ax, ay] = polar(78, 108), [bx, by] = polar(78, 135);
    el('path', { d: `M${ax} ${ay} A78 78 0 0 1 ${bx} ${by}`, stroke: '#d62828', 'stroke-width': 8, fill: 'none' }, this.scale);
    for (let i = 0; i <= 50; i++) {
      const deg = -135 + (270 * i) / 50, major = i % 10 === 0;
      const [x1, y1] = polar(major ? 70 : 76, deg), [x2, y2] = polar(82, deg);
      el('line', { x1, y1, x2, y2, stroke: '#111', 'stroke-width': major ? 2.2 : 1 }, this.scale);
      if (major) {
        const [tx, ty] = polar(58, deg);
        const t = el('text', { x: tx, y: ty + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, 'font-family': 'sans-serif', fill: '#111' }, this.scale);
        t.textContent = Math.round((cap * i) / 50);
      }
    }
  }

  set(v) { this.value = v; }

  update(dt) {
    this.shown += (this.value - this.shown) * Math.min(1, dt * 12);
    const f = Math.min(this.shown / this.cap, 1.06);
    this.needle.setAttribute('transform', `rotate(${-135 + 270 * f} 100 100)`);
    this.readout.textContent = this.shown < 10 ? this.shown.toFixed(2) : this.shown.toFixed(1);
  }

  crack() { this.cracks.setAttribute('opacity', 0.9); }
  reset() { this.cracks.setAttribute('opacity', 0); this.value = this.shown = 0; }
}

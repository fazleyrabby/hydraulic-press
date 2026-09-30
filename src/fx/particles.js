import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Lightweight CPU particle system rendered as a single Points draw call. */
export class ParticleSystem {
  constructor(scene, { max = 3000, additive = false, texture } = {}) {
    this.max = max;
    this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: texture || softTexture() }, uScale: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  emit(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: p.pos.x, y: p.pos.y, z: p.pos.z,
      vx: p.vel?.x ?? 0, vy: p.vel?.y ?? 0, vz: p.vel?.z ?? 0,
      life: 0, max: p.life ?? 1,
      s0: p.size ?? 1, s1: p.sizeEnd ?? p.size ?? 1,
      r: p.color[0], g: p.color[1], b: p.color[2],
      a0: p.alpha ?? 1,
      grav: p.gravity ?? 0, drag: p.drag ?? 0,
      floor: p.floor ?? -Infinity,
      onFloor: p.onFloor,
    });
  }

  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) {
        if (p.onFloor) p.onFloor(p);
        continue;
      }
      L[w++] = p;
    }
    L.length = w;
    for (let i = 0; i < w; i++) {
      const p = L[i], k = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
      this.alpha[i] = p.a0 * (1 - k * k);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, w);
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[n].needsUpdate = true;
  }

  clear() { this.list.length = 0; this.points.geometry.setDrawRange(0, 0); }
}

/** High-level emitters used by the press and the objects. */
export class FX {
  constructor(scene) {
    this.sparksSys = new ParticleSystem(scene, { max: 2500, additive: true });
    this.smokeSys = new ParticleSystem(scene, { max: 1500 });
    this.fluidSys = new ParticleSystem(scene, { max: 3500 });
    this.groundAt = () => 0;
  }

  setScale(s) {
    for (const sys of [this.sparksSys, this.smokeSys, this.fluidSys]) sys.material.uniforms.uScale.value = s;
  }

  sparks(pos, n = 40, speed = 300, { up = 0.4, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1) * spread, rand(-0.2, 1) * up + rand(0, 0.3), rand(-1, 1) * spread)
        .normalize().multiplyScalar(speed * rand(0.3, 1.2));
      const hot = Math.random();
      this.sparksSys.emit({
        pos, vel: v, life: rand(0.25, 0.9), size: rand(0.25, 0.6), sizeEnd: 0.05,
        color: [6, 2.4 + hot * 2, 0.5 + hot * 0.6], gravity: 700, drag: 1.2,
        floor: this.groundAt(pos.x, pos.z),
      });
    }
  }

  smoke(pos, n = 10, { color = [0.35, 0.35, 0.36], size = 4, sizeEnd = 14, life = 3, rise = 12, spread = 3, alpha = 0.35 } = {}) {
    for (let i = 0; i < n; i++) {
      this.smokeSys.emit({
        pos: new THREE.Vector3(pos.x + rand(-spread, spread), pos.y + rand(-spread, spread) * 0.4, pos.z + rand(-spread, spread)),
        vel: new THREE.Vector3(rand(-6, 6), rise * rand(0.5, 1.5), rand(-6, 6)),
        life: life * rand(0.6, 1.3), size, sizeEnd: sizeEnd * rand(0.7, 1.3),
        color: color.map((c) => c * rand(0.85, 1.15)), alpha, drag: 0.6,
      });
    }
  }

  dust(pos, n = 30, color = [0.8, 0.8, 0.8], speed = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smokeSys.emit({
        pos, vel: new THREE.Vector3(Math.cos(a) * speed * rand(0.3, 1), rand(0, speed * 0.4), Math.sin(a) * speed * rand(0.3, 1)),
        life: rand(0.8, 2), size: rand(0.8, 2), sizeEnd: rand(3, 7), color, alpha: 0.5, drag: 2.5,
      });
    }
  }

  /** Hydraulic fluid: jets, sprays and drips. */
  fluid(pos, dir, n = 20, speed = 300, { spread = 0.25, size = 0.55, life = 1.6, onFloor } = {}) {
    const floor = this.groundAt(pos.x, pos.z);
    for (let i = 0; i < n; i++) {
      const v = dir.clone().normalize()
        .add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread))
        .normalize().multiplyScalar(speed * rand(0.6, 1.2));
      this.fluidSys.emit({
        pos: pos.clone(), vel: v, life: life * rand(0.7, 1.2), size: size * rand(0.6, 1.4), sizeEnd: size * 0.8,
        color: [0.32 * rand(0.8, 1.1), 0.16 * rand(0.8, 1.1), 0.025], alpha: 0.95, gravity: 981, drag: 0.4,
        floor, onFloor,
      });
    }
  }

  update(dt) {
    this.sparksSys.update(dt);
    this.smokeSys.update(dt);
    this.fluidSys.update(dt);
  }

  clear() {
    this.sparksSys.clear();
    this.smokeSys.clear();
    this.fluidSys.clear();
  }
}

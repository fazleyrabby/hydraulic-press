import * as THREE from 'three';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

function stripeCanvas(width, height, stripes) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = '#efc416';
  g.fillRect(0, 0, width, height);
  g.fillStyle = '#131313';
  const period = width / stripes;
  for (let i = -Math.ceil(height / period) - 1; i <= stripes + 1; i++) {
    const x = i * period;
    g.beginPath();
    g.moveTo(x, height);
    g.lineTo(x + period / 2, height);
    g.lineTo(x + period / 2 + height, 0);
    g.lineTo(x + height, 0);
    g.closePath();
    g.fill();
  }
  // grime + scuffs
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.09})`;
    g.fillRect(Math.random() * width, Math.random() * height, rand(1, 5), rand(1, 3));
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * width, Math.random() * height, rand(2, 14), 1);
  }
  for (const y of [0, height - 6]) {
    const gr = g.createLinearGradient(0, y, 0, y + 6);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, y, width, 6);
  }
  return c;
}

/** Grows lightning-like cracks on a canvas texture. */
class CrackPainter {
  constructor(canvas, texture) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.tex = texture;
    this.cracks = [];
    this.dirty = false;
  }
  seed(n) {
    for (let i = 0; i < n; i++) {
      const fromTop = Math.random() < 0.5;
      this.cracks.push({
        x: Math.random() * this.c.width,
        y: fromTop ? 0 : this.c.height,
        a: (fromTop ? Math.PI / 2 : -Math.PI / 2) + rand(-0.5, 0.5),
        life: rand(25, 60),
        w: rand(2, 4),
      });
    }
  }
  grow(steps) {
    const g = this.g, W = this.c.width, H = this.c.height;
    for (let s = 0; s < steps; s++) {
      for (const k of this.cracks) {
        if (k.life <= 0) continue;
        const len = rand(4, 13);
        k.a += rand(-0.7, 0.7);
        const nx = k.x + Math.cos(k.a) * len, ny = k.y + Math.sin(k.a) * len;
        for (const off of [0, W, -W]) {
          g.strokeStyle = 'rgba(255,255,255,0.25)';
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(k.x + off + 1, k.y + 1); g.lineTo(nx + off + 1, ny + 1); g.stroke();
          g.strokeStyle = '#050505';
          g.lineWidth = k.w;
          g.beginPath(); g.moveTo(k.x + off, k.y); g.lineTo(nx + off, ny); g.stroke();
        }
        k.x = nx; k.y = Math.max(0, Math.min(H, ny)); k.life--; k.w = Math.max(0.8, k.w * 0.97);
        if (Math.random() < 0.06) this.cracks.push({ ...k, a: k.a + rand(-1.2, 1.2), life: k.life * 0.6, w: k.w * 0.7 });
      }
    }
    this.dirty = true;
  }
  flush() {
    if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; }
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function cyl(r, h, mat, seg = 48, hSeg = 1) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, hSeg), mat);
}
function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** A pie-slice of a cylinder with closed cut faces; side UVs stay continuous with the full ring. */
function wedge(r, h, start, len, sideMat, capMat, cutMat) {
  const g = new THREE.Group();
  const seg = Math.max(4, Math.round((64 * len) / TAU));
  const geo = new THREE.CylinderGeometry(r, r, h, seg, 1, false, start, len);
  const uv = geo.attributes.uv;
  for (let i = 0; i < (seg + 1) * 2; i++) uv.setX(i, (start + uv.getX(i) * len) / TAU);
  g.add(new THREE.Mesh(geo, [sideMat, capMat, capMat]));
  for (const a of [start, start + len]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(r, h), cutMat);
    p.rotation.y = a - Math.PI / 2;
    p.position.set((Math.sin(a) * r) / 2, 0, (Math.cos(a) * r) / 2);
    g.add(p);
  }
  g.userData.midAngle = start + len / 2;
  return g;
}

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

export class HydraulicPress {
  constructor() {
    this.group = new THREE.Group();
    this.baseTop = 4;
    this.anvilTop = 12;
    this.restY = this.anvilTop + 15; // plate underside when retracted
    this.ramY = this.restY;
    this.state = 'ok'; // ok | strain | broken
    this.t = 0;
    this.alarm = false;

    this._materials();
    this._buildBase();
    this._buildColumns();
    this._buildCrown();
    this._buildRam();
    this._buildAnvil();
    this._buildHydraulics();
    this.group.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.setRam(this.restY);
  }

  _materials() {
    this.plateCanvas = stripeCanvas(2048, 136, 10);
    this.anvilCanvas = stripeCanvas(2048, 280, 11);
    const tex = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    };
    this.plateTex = tex(this.plateCanvas);
    this.anvilTex = tex(this.anvilCanvas);
    this.plateCracks = new CrackPainter(this.plateCanvas, this.plateTex);
    this.anvilCracks = new CrackPainter(this.anvilCanvas, this.anvilTex);

    this.M = {
      paint: new THREE.MeshStandardMaterial({ color: '#343a43', metalness: 0.35, roughness: 0.55 }),
      barrel: new THREE.MeshStandardMaterial({ color: '#4a525e', metalness: 0.5, roughness: 0.4 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.85, roughness: 0.45 }),
      steel: new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 1, roughness: 0.25 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#f4f6f8', metalness: 1, roughness: 0.07 }),
      cut: new THREE.MeshStandardMaterial({ color: '#6d7178', metalness: 0.9, roughness: 0.7, side: THREE.DoubleSide }),
      hose: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 }),
      brass: new THREE.MeshStandardMaterial({ color: '#c9a54a', metalness: 1, roughness: 0.3 }),
      pump: new THREE.MeshStandardMaterial({ color: '#2b4f73', metalness: 0.3, roughness: 0.5 }),
      plateSide: new THREE.MeshStandardMaterial({ map: this.plateTex, metalness: 0.2, roughness: 0.45 }),
      anvilSide: new THREE.MeshStandardMaterial({ map: this.anvilTex, metalness: 0.2, roughness: 0.5 }),
      oil: new THREE.MeshStandardMaterial({ color: '#2a1703', metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.93 }),
      beacon: new THREE.MeshStandardMaterial({ color: '#5a0a0a', emissive: '#ff2200', emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.9 }),
    };
  }

  _buildBase() {
    const base = box(44, this.baseTop, 28, this.M.paint);
    base.position.y = this.baseTop / 2;
    this.group.add(base);
    const bandTex = new THREE.CanvasTexture(stripeCanvas(1024, 40, 16));
    bandTex.colorSpace = THREE.SRGBColorSpace;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(44, 1.4), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.6 }));
    band.position.set(0, 2, 14.02);
    this.group.add(band);
    // feet
    for (const x of [-19, 19]) for (const z of [-11, 11]) {
      const f = cyl(1.8, 0.6, this.M.darkSteel, 16);
      f.position.set(x, 0.3, z);
      this.group.add(f);
    }
  }

  _buildColumns() {
    const M = this.M;
    const span = [this.baseTop, 52];
    this.columns = [];
    const addCol = (x, y0, y1, dir) => {
      const h = y1 - y0;
      const m = cyl(2.2, h, M.steel, 32, Math.round(h / 2));
      m.position.set(x, (y0 + y1) / 2, 0);
      m.userData.orig = m.geometry.attributes.position.array.slice();
      this.group.add(m);
      this.columns.push({ mesh: m, dir, y0, h });
      return m;
    };
    this.colL = addCol(-16, span[0], span[1], -1);
    this.colRLow = addCol(16, span[0], 30, 1);
    this.colRUp = addCol(16, 30, span[1], 1);
    for (const x of [-16, 16]) {
      const nut = cyl(3.3, 1.6, M.darkSteel, 6);
      nut.position.set(x, this.baseTop + 0.8, 0);
      this.group.add(nut);
    }
    const nutUp = cyl(3.3, 1.6, M.darkSteel, 6);
    nutUp.position.set(0, 22 / 2 - 0.8, 0);
    this.colRUp.add(nutUp);
    const nutUpL = cyl(3.3, 1.6, M.darkSteel, 6);
    nutUpL.position.set(-16, 51.2, 0);
    this.group.add(nutUpL);
  }

  _buildCrown() {
    const M = this.M;
    const P = (this.crown = new THREE.Group());
    P.position.set(-16, 52, 0); // pivots about the top of the left column when things go wrong
    this.group.add(P);
    const at = (m, x, y, z) => { m.position.set(x + 16, y - 52, z); P.add(m); return m; };

    at(box(42, 8, 12, M.paint), 0, 56, 0);
    at(box(42.4, 1, 12.4, M.darkSteel), 0, 52.5, 0);
    at(box(42.4, 1, 12.4, M.darkSteel), 0, 59.5, 0);
    for (const x of [-9, 9]) at(box(1.2, 7, 12.8, M.darkSteel), x, 56, 0);

    at(cyl(6.5, 18, M.barrel, 48), 0, 43, 0);
    at(cyl(7.4, 1.4, M.darkSteel, 48), 0, 51.3, 0);
    this.gland = at(cyl(7.2, 1.6, M.darkSteel, 48), 0, 34.8, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      at(cyl(0.45, 0.6, M.steel, 6), Math.sin(a) * 6.6, 34.0, Math.cos(a) * 6.6);
    }
    this.ports = [];
    for (const z of [2.3, -2.3]) {
      const p = at(cyl(0.9, 2.4, M.brass, 16), 7.4, 47, z);
      p.rotation.z = Math.PI / 2;
      this.ports.push(p);
    }

    // Warning beacon
    at(cyl(1.4, 0.8, M.darkSteel, 24), 16, 60.4, 3);
    this.beaconDome = at(new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 12, 0, TAU, 0, Math.PI / 2), M.beacon), 16, 60.8, 3);
    this.beaconLight = new THREE.PointLight('#ff2a10', 0, 150, 1.4);
    this.beaconLight.position.set(0, 1.5, 0);
    this.beaconDome.add(this.beaconLight);
  }

  _buildRam() {
    const M = this.M;
    const R = (this.ram = new THREE.Group());
    this.group.add(R);

    const cuts = [0];
    while (cuts[cuts.length - 1] < TAU - 1.1) cuts.push(cuts[cuts.length - 1] + rand(0.6, 1.1));
    cuts.push(TAU);
    const off = Math.random() * TAU;
    this.plateWedges = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const w = wedge(8.5, 3.5, cuts[i] + off, cuts[i + 1] - cuts[i], M.plateSide, M.darkSteel, M.cut);
      w.position.y = 1.75;
      R.add(w);
      this.plateWedges.push(w);
    }

    this.flange = cyl(9.3, 2, M.steel, 64);
    this.flange.position.y = 4.5;
    R.add(this.flange);
    this.bolts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const b = cyl(0.75, 0.9, M.darkSteel, 6);
      b.position.set(Math.sin(a) * 7.9, 5.95, Math.cos(a) * 7.9);
      b.userData.angle = a;
      R.add(b);
      this.bolts.push(b);
    }
    const collar = cyl(5.4, 1.2, M.steel, 48);
    collar.position.y = 6.1;
    R.add(collar);
    const rod = cyl(4.5, 32, M.chrome, 48);
    rod.position.y = 5.5 + 16;
    R.add(rod);
  }

  _buildAnvil() {
    const M = this.M;
    const h = this.anvilTop - this.baseTop;
    const off = rand(0, TAU);
    const cuts = [0, rand(1.8, 2.4), rand(3.9, 4.5), TAU];
    this.anvilPieces = [];
    for (let i = 0; i < 3; i++) {
      const w = wedge(9.5, h, cuts[i] + off, cuts[i + 1] - cuts[i], M.anvilSide, M.darkSteel, M.cut);
      w.position.y = this.baseTop + h / 2;
      this.group.add(w);
      this.anvilPieces.push(w);
    }
  }

  _buildHydraulics() {
    const M = this.M;
    const pump = box(10, 14, 10, M.pump);
    pump.position.set(31, 7, -5);
    this.group.add(pump);
    const motor = cyl(3, 8, M.darkSteel, 32);
    motor.rotation.z = Math.PI / 2;
    motor.position.set(31, 17, -5);
    this.group.add(motor);
    const gaugeFace = cyl(1.8, 0.4, M.chrome, 32);
    gaugeFace.rotation.x = Math.PI / 2;
    gaugeFace.position.set(31, 9, 0.2);
    this.group.add(gaugeFace);

    this.crown.updateMatrixWorld(true);
    this.hoseEnds = [];
    this.hoses = this.ports.map((port, i) => {
      const s = port.getWorldPosition(new V3()).add(new V3(1.2, 0, 0));
      const pts = [
        s,
        s.clone().add(new V3(5, 0.5, 0.3)),
        new V3(21, 42, s.z + 1.5),
        new V3(28.5, 28, s.z),
        new V3(29 + i * 3, 16, -3 - i * 2),
        new V3(29 + i * 3, 14, -3 - i * 2),
      ];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.6, 10), M.hose);
      this.group.add(tube);
      this.hoseEnds.push({ pos: s.clone(), dir: new V3(0.2, 0.25, i ? -0.6 : 0.6) });
      return tube;
    });

    const puddleTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.arc(128 + rand(-60, 60), 128 + rand(-60, 60), rand(30, 70), 0, TAU);
        g.fill();
      }
      return new THREE.CanvasTexture(c);
    })();
    this.puddle = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial({ color: '#1e1002', metalness: 0.4, roughness: 0.04, alphaMap: puddleTex, transparent: true, depthWrite: false })
    );
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.position.set(0, this.baseTop + 0.03, 2);
    this.puddle.scale.setScalar(0.001);
    this.puddle.receiveShadow = true;
    this.group.add(this.puddle);
  }

  // -------------------------------------------------------------------------

  setRam(y) {
    this.ramY = y;
    this.ram.position.y = y;
  }

  _bowColumns(amount) {
    for (const c of this.columns) {
      if (c.mesh.parent !== this.group) continue;
      const pos = c.mesh.geometry.attributes.position;
      const o = c.mesh.userData.orig;
      for (let i = 0; i < pos.count; i++) {
        const ly = o[i * 3 + 1];
        const u = (c.mesh.position.y + ly - this.baseTop) / 48;
        pos.setX(i, o[i * 3] + c.dir * amount * Math.sin(Math.PI * u));
      }
      pos.needsUpdate = true;
      c.mesh.geometry.computeVertexNormals();
    }
  }

  beginStrain() {
    this.state = 'strain';
    this.alarm = true;
    this.popped = 0;
    this.plateCracks.seed(5);
  }

  /** k: 0 → 1 over the overload period. */
  updateStrain(k, dt, ctx) {
    const { fx, sound, debris } = ctx;
    const vib = 0.03 + k * k * 0.25;
    this.ram.position.x = rand(-vib, vib);
    this.ram.position.z = rand(-vib, vib);
    this.crown.position.x = -16 + rand(-vib, vib) * 0.4;
    this._bowColumns(k * k * 1.4);

    this.plateCracks.grow(Math.random() < k * 1.5 ? 1 : 0);
    if (k > 0.35 && !this._anvilSeeded) { this._anvilSeeded = true; this.anvilCracks.seed(4); }
    if (k > 0.35) this.anvilCracks.grow(Math.random() < k ? 1 : 0);
    this.plateCracks.flush();
    this.anvilCracks.flush();

    const hw = ctx.subject.halfWidth;
    if (Math.random() < dt * (4 + k * 30)) {
      const p = new V3(rand(-hw, hw), this.ramY, rand(-1, 1) * ctx.subject.halfDepth + 0.3);
      fx.sparks(p, Math.round(6 + k * 25), 120 + k * 250);
    }
    if (Math.random() < dt * (0.8 + k * 3)) sound.creak(0.6 + k);
    if (k > 0.45 && Math.random() < dt * 20 * k) {
      const a = rand(0, TAU);
      const gp = this.gland.getWorldPosition(new V3());
      fx.fluid(gp.add(new V3(Math.sin(a) * 6.8, -0.8, Math.cos(a) * 6.8)), new V3(Math.sin(a), -1, Math.cos(a)), 2, 30, { spread: 0.4 });
    }
    if (k > 0.6 && Math.random() < dt * 8) {
      for (const h of this.hoseEnds) fx.smoke(h.pos, 1, { color: [0.9, 0.9, 0.9], size: 1.5, sizeEnd: 7, life: 1.2, rise: 20, spread: 0.5, alpha: 0.25 });
    }
    const popAt = [0.72, 0.86];
    if (this.popped < popAt.length && k > popAt[this.popped]) {
      const b = this.bolts.pop();
      if (b) this._launchBolt(b, debris, fx);
      sound.ping(rand(0.9, 1.2));
      this.popped++;
    }
  }

  _launchBolt(b, debris, fx) {
    const a = b.userData.angle;
    const wp = b.getWorldPosition(new V3());
    debris.add(b, new V3(Math.sin(a) * rand(150, 400), rand(250, 500), Math.cos(a) * rand(150, 400)), new V3(rand(-30, 30), rand(-30, 30), rand(-30, 30)));
    fx.sparks(wp, 12, 200);
  }

  explode(ctx) {
    const { fx, sound, debris, scene } = ctx;
    this.state = 'broken';
    this.brokenT = 0;
    this._bowColumns(0);
    const center = new V3(0, this.ramY, 0);

    for (const w of this.plateWedges) {
      const a = w.userData.midAngle;
      const dir = new V3(Math.sin(a), 0, Math.cos(a));
      debris.add(w, dir.multiplyScalar(rand(280, 650)).add(new V3(0, rand(60, 320), 0)), new V3(rand(-14, 14), rand(-14, 14), rand(-14, 14)), { bounce: 0.35 });
    }
    for (const b of this.bolts.splice(0)) this._launchBolt(b, debris, fx);

    for (const p of this.anvilPieces) {
      const a = p.userData.midAngle;
      const dir = new V3(Math.sin(a), 0, Math.cos(a));
      debris.add(p, dir.multiplyScalar(rand(70, 170)).add(new V3(0, rand(90, 180), 0)), new V3(rand(-3, 3), rand(-2, 2), rand(-3, 3)), { bounce: 0.2 });
    }

    // Right column snaps; crown sags about the left column.
    debris.add(this.colRUp, new V3(rand(120, 220), rand(80, 160), rand(-50, 50)), new V3(rand(-1, 1), rand(-1, 1), rand(-5, -3)), { bounce: 0.25 });
    this.crown.position.x = -16;
    this.crown.attach(this.ram);
    this.crownW = 0;
    this.crownFalling = true;
    const stump = new V3(16, 30, 0);
    fx.sparks(stump, 60, 350);

    fx.sparks(center, 320, 650, { up: 0.6 });
    fx.sparks(new V3(0, this.anvilTop, 0), 120, 400);
    fx.smoke(center, 40, { color: [0.28, 0.28, 0.3], size: 5, sizeEnd: 26, life: 4, rise: 16, spread: 6, alpha: 0.5 });
    fx.dust(new V3(0, this.anvilTop, 0), 60, [0.6, 0.58, 0.55], 160);
    const gp = this.gland.getWorldPosition(new V3());
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      fx.fluid(gp.clone().add(new V3(Math.sin(a) * 7, -0.6, Math.cos(a) * 7)), new V3(Math.sin(a), rand(-0.3, 0.4), Math.cos(a)), 6, 380, { spread: 0.25 });
    }

    sound.bang();
    sound.setHiss(1);
    ctx.flash();
    ctx.shake(3.2);
    ctx.slowmo(0.22, 1.8);
  }

  /** Per-frame: beacon + post-failure mayhem. */
  update(dt, ctx) {
    this.t += dt;
    if (this.alarm) {
      const on = Math.sin(this.t * 14) > 0;
      this.M.beacon.emissiveIntensity = on ? 8 : 0.3;
      this.beaconLight.intensity = on ? 900 : 0;
    }
    if (this.state !== 'broken') return;
    const { fx, sound } = ctx;
    const t = (this.brokenT += dt);

    if (this.crownFalling) {
      this.crownW -= 4 * dt;
      this.crown.rotation.z += this.crownW * dt;
      if (this.crown.rotation.z < -0.15) {
        this.crown.rotation.z = -0.15;
        if (Math.abs(this.crownW) > 0.08) {
          this.crownW = -this.crownW * 0.3;
          sound.thud(0.8);
          ctx.shake(0.8);
        } else {
          this.crownFalling = false;
        }
      }
    }

    const jet = Math.exp(-t / 3.5);
    sound.setHiss(jet);
    for (const h of this.hoseEnds) {
      if (Math.random() < 0.9) fx.fluid(h.pos, h.dir, Math.round(6 * jet) + 1, 260 * jet + 60, { spread: 0.18, size: 0.45 });
    }
    if (Math.random() < dt * 25) {
      const a = rand(0, TAU);
      const gp = this.gland.getWorldPosition(new V3());
      fx.fluid(gp.add(new V3(Math.sin(a) * 6.8, -0.8, Math.cos(a) * 6.8)), new V3(0, -1, 0), 1, 10, { spread: 0.1 });
    }
    if (Math.random() < dt * 12 * Math.exp(-t / 6)) {
      fx.smoke(new V3(rand(-4, 4), this.anvilTop + 4, rand(-4, 4)), 1, { color: [0.3, 0.3, 0.32], size: 4, sizeEnd: 20, life: 4, rise: 14, spread: 2, alpha: 0.35 });
    }
    if (t < 2.5 && Math.random() < dt * 10) fx.sparks(new V3(16, 30, 0), 6, 180);

    const s = Math.min(15, 1 + t * 4) * (1 - Math.exp(-t * 0.6));
    this.puddle.scale.set(s, s * 0.8, 1);
  }
}

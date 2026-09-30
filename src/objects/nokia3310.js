import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// 84×48 monochrome LCD with a tiny 5×7 bitmap font
// ---------------------------------------------------------------------------

const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  n: ['00000', '00000', '10110', '11001', '10001', '10001', '10001'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
};

class LCD {
  constructor() {
    this.w = 84; this.h = 48; this.px = 4;
    this.buf = new Uint8Array(this.w * this.h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w * this.px;
    this.canvas.height = this.h * this.px;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  clear() { this.buf.fill(0); }
  set(x, y) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = 1; }
  rect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j); }
  text(str, x, y) {
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      g.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '1') this.set(x + i, y + j); });
      x += 6;
    }
  }
  textCenter(str, y) { this.text(str, Math.round((this.w - str.length * 6 + 1) / 2), y); }
  circle(cx, cy, r) { for (let a = 0; a < Math.PI * 2; a += 0.02) this.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)); }
  arc(cx, cy, r, a0, a1) { for (let a = a0; a < a1; a += 0.02) this.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)); }

  statusBars() {
    // signal (left) and battery (right) columns, like the real thing
    for (let i = 0; i < 4; i++) {
      this.rect(0, 30 - i * 6, 1 + i, 4);
      this.rect(this.w - 1 - i, 30 - i * 6, 1 + i, 4);
    }
    // antenna
    this.rect(1, 36, 1, 7); this.set(0, 36); this.set(2, 36); this.set(0, 37); this.set(2, 37);
    // battery
    this.rect(this.w - 3, 36, 3, 7); this.set(this.w - 2, 35);
  }

  flush(backlight = 0) {
    const g = this.canvas.getContext('2d'), p = this.px;
    const grad = g.createLinearGradient(0, 0, 0, this.canvas.height);
    grad.addColorStop(0, backlight ? '#b8e07a' : '#97b566');
    grad.addColorStop(1, backlight ? '#a6d266' : '#86a558');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.buf[y * this.w + x]) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x * p + 1.5, y * p + 1.5, p - 0.6, p - 0.6); // pixel shadow on the backplane
        g.fillStyle = '#1c2912';
        g.fillRect(x * p, y * p, p - 0.6, p - 0.6);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.035)';
        g.fillRect(x * p, y * p, p - 0.6, p - 0.6);
      }
    }
    this.texture.needsUpdate = true;
  }
}

function drawScreen(lcd, mode) {
  lcd.clear();
  if (mode === 'victory') {
    lcd.circle(42, 17, 12);
    lcd.rect(37, 11, 2, 4); lcd.rect(46, 11, 2, 4);
    lcd.arc(42, 17, 7, 0.35, Math.PI - 0.35);
    lcd.arc(42, 17.5, 7, 0.4, Math.PI - 0.4);
    lcd.textCenter('3310 WINS', 36);
  } else {
    lcd.statusBars();
    lcd.text('16:52', 50, 1);
    lcd.textCenter('NOKIA', 15);
    lcd.textCenter('Menu', 38);
  }
}

// ---------------------------------------------------------------------------
// Model — built in portrait (top = +y, face = +z), then laid on its long edge
// ---------------------------------------------------------------------------

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function ellipse(rx, ry) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}
/** Extruded flat part; back face at z=0. */
function slab(shape, depth, bevel, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 32,
  });
  geo.translate(0, 0, bevel);
  const m = new THREE.Mesh(geo, mat);
  m.userData.thickness = depth + bevel * 2;
  return m;
}
function labelTexture(main, sub, { w = 128, h = 80, color = '#1b2a55', mainSize = 46, subSize = 26 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.font = `bold ${mainSize}px Arial, Helvetica, sans-serif`;
  const mw = g.measureText(main).width;
  g.font = `bold ${subSize}px Arial, Helvetica, sans-serif`;
  const sw = sub ? g.measureText(sub).width + 6 : 0;
  let x = (w - mw - sw) / 2;
  g.font = `bold ${mainSize}px Arial, Helvetica, sans-serif`;
  g.fillText(main, x, h / 2 + 2);
  if (sub) {
    g.font = `bold ${subSize}px Arial, Helvetica, sans-serif`;
    g.fillText(sub, x + mw + 6, h / 2 + 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildNokia() {
  const phone = new THREE.Group();
  const FRONT = 1.1;

  const body = new THREE.MeshPhysicalMaterial({ color: '#1e2b4f', roughness: 0.42, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const silver = new THREE.MeshStandardMaterial({ color: '#b7bcc4', metalness: 0.75, roughness: 0.32 });
  const silverLight = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.6, roughness: 0.28 });
  const lens = new THREE.MeshPhysicalMaterial({ color: '#232a3a', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const keyMat = new THREE.MeshPhysicalMaterial({ color: '#dde1e7', roughness: 0.35, clearcoat: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#0a0d14', roughness: 0.8 });

  // Body silhouette with the classic slight waist
  const L = 5.3, W = 2.05, r = 1.6, waist = 0.3;
  const s = new THREE.Shape();
  s.moveTo(-W, -L + r);
  s.quadraticCurveTo(-W + waist, 0.4, -W, L - r);
  s.quadraticCurveTo(-W, L, -W + r, L);
  s.lineTo(W - r, L);
  s.quadraticCurveTo(W, L, W, L - r);
  s.quadraticCurveTo(W - waist, 0.4, W, -L + r);
  s.quadraticCurveTo(W, -L, W - r, -L);
  s.lineTo(-W + r, -L);
  s.quadraticCurveTo(-W, -L, -W, -L + r);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.35, bevelSegments: 8, curveSegments: 48 });
  bodyGeo.translate(0, 0, -0.7);
  phone.add(new THREE.Mesh(bodyGeo, body));

  const put = (m, x, y, z, rz = 0) => { m.position.set(x, y, z); m.rotation.z = rz; phone.add(m); return m; };

  // Silver surround, lens and LCD
  const ring = put(slab(roundedRect(3.6, 4.5, 1.3), 0.05, 0.03, silver), 0, 1.15, FRONT - 0.02);
  const ringTop = FRONT - 0.02 + ring.userData.thickness;
  const lensM = put(slab(roundedRect(3.2, 2.85, 0.45), 0.03, 0.01, lens), 0, 1.95, ringTop - 0.005);
  const lensTop = ringTop - 0.005 + lensM.userData.thickness;

  const lcd = new LCD();
  const lcdMat = new THREE.MeshStandardMaterial({ map: lcd.texture, emissiveMap: lcd.texture, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.55 });
  put(new THREE.Mesh(new THREE.PlaneGeometry(2.66, 1.52), lcdMat), 0, 2.0, lensTop + 0.003);

  // Navi key with blue stripe, C and arrow keys
  const navi = put(slab(ellipse(0.95, 0.3), 0.08, 0.07, silverLight), 0, 0.05, ringTop - 0.01);
  const naviTop = ringTop - 0.01 + navi.userData.thickness;
  put(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.07), new THREE.MeshStandardMaterial({ color: '#2a7de1', emissive: '#1f6ad1', emissiveIntensity: 0.6 })), 0, 0.05, naviTop + 0.002);
  for (const [x, rz, lbl] of [[-1.15, -0.45, 'C'], [1.15, 0.45, '▲▼']]) {
    const k = put(slab(ellipse(0.52, 0.28), 0.06, 0.06, silver), x, -0.5, ringTop - 0.02, rz);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: labelTexture(lbl, '', { color: '#26324f', mainSize: lbl === 'C' ? 50 : 30 }), transparent: true }));
    put(lab, x, -0.5, ringTop - 0.02 + k.userData.thickness + 0.002, rz);
  }

  // Keypad
  const keys = [['1', 'oo'], ['2', 'abc'], ['3', 'def'], ['4', 'ghi'], ['5', 'jkl'], ['6', 'mno'], ['7', 'pqrs'], ['8', 'tuv'], ['9', 'wxyz'], ['*', '+'], ['0', '_'], ['#', '']];
  const rows = [-1.35, -2.3, -3.25, -4.2];
  keys.forEach(([main, sub], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = (col - 1) * 1.3, y = rows[row] + (col === 1 ? -0.08 : 0.06);
    const rz = (1 - col) * 0.16;
    const k = put(slab(ellipse(0.56, 0.32), 0.07, 0.06, keyMat), x, y, FRONT - 0.02, rz);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.61), new THREE.MeshBasicMaterial({ map: labelTexture(main, sub), transparent: true }));
    put(lab, x, y, FRONT - 0.02 + k.userData.thickness + 0.002, rz);
  });

  // Earpiece + logo
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12), dark);
    d.rotation.x = Math.PI / 2;
    d.position.set(0, 4.35 + i * 0.18, FRONT);
    phone.add(d);
  }
  const logo = labelTexture('NOKIA', '', { w: 256, h: 64, color: '#eef1f6', mainSize: 44 });
  put(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false })), 0, 3.75, FRONT + 0.002);

  // Stand it on its long edge, top to the left — like the video
  const root = new THREE.Group();
  phone.rotation.z = Math.PI / 2;
  root.add(phone);

  root.userData.lcd = lcd;
  root.userData.lcdMat = lcdMat;
  root.userData.setScreen = (mode, backlight = 0) => {
    drawScreen(lcd, mode);
    lcd.flush(backlight);
    lcdMat.emissiveIntensity = backlight ? 0.55 : 0.18;
  };
  root.userData.setScreen('idle');
  return root;
}

// ---------------------------------------------------------------------------
// Optional downloaded model: "Nokia 3310" by Artemecia (CC BY 4.0)
// https://sketchfab.com/3d-models/nokia-3310-67ce77f111394e738ba1be94c146ef29
// Drop the glTF export into models/nokia3310/. Falls back to the procedural phone if missing.
// ---------------------------------------------------------------------------

const MODEL_URL = 'models/nokia3310/nokia_3310.glb';
const MODEL_FIX = {
  rotation: [0, 0, 0],       // Euler (rad) to get portrait: top = +y, face = +z
  length: 11.3,              // real 3310 length in cm
  screenMatch: /screen|display|lcd|glass/i, // mesh/material name of the display
  // Per-material tweaks (by glTF material name) so it sits well in this lighting.
  materials: {
    Base: { roughness: 0.5 },
    Trim: { metalness: 0.75, roughness: 0.3 },
    Buttons: { roughness: 0.45 },
  },
};

let modelScene = null;
try {
  const head = await fetch(MODEL_URL, { method: 'HEAD' });
  if (head.ok) modelScene = (await new GLTFLoader().loadAsync(MODEL_URL)).scene;
  modelScene?.traverse((o) => {
    if (o.isMesh) Object.assign(o.material, MODEL_FIX.materials[o.material.name] || {});
  });
} catch (e) {
  console.warn('Nokia model not loaded, using procedural phone.', e);
}

function buildFromModel() {
  const phone = new THREE.Group();
  const model = modelScene.clone(true);
  model.rotation.set(...MODEL_FIX.rotation);
  phone.add(model);

  // Scale to real size, centre at origin.
  phone.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(phone);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(MODEL_FIX.length / size.y);
  phone.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(phone);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  phone.updateMatrixWorld(true);

  // Find the display and lay our pixel LCD on top of it.
  let screen = null;
  model.traverse((o) => {
    if (!screen && o.isMesh && (MODEL_FIX.screenMatch.test(o.name) || MODEL_FIX.screenMatch.test(o.material?.name || ''))) screen = o;
  });
  const lcd = new LCD();
  const lcdMat = new THREE.MeshStandardMaterial({ map: lcd.texture, emissiveMap: lcd.texture, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.55 });
  const sb = screen ? new THREE.Box3().setFromObject(screen) : null;
  const w = sb ? (sb.max.x - sb.min.x) * 0.92 : 2.66;
  const lcdPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 1.75), lcdMat);
  if (sb) lcdPlane.position.set((sb.min.x + sb.max.x) / 2, (sb.min.y + sb.max.y) / 2, sb.max.z + 0.01);
  else lcdPlane.position.set(0, 2.0, box.max.z + 0.01);
  phone.add(lcdPlane);

  const root = new THREE.Group();
  phone.rotation.z = Math.PI / 2;
  root.add(phone);
  root.userData.setScreen = (mode, backlight = 0) => {
    drawScreen(lcd, mode);
    lcd.flush(backlight);
    lcdMat.emissiveIntensity = backlight ? 0.55 : 0.18;
  };
  root.userData.setScreen('idle');
  return root;
}

export default {
  id: 'nokia3310',
  name: 'Nokia 3310',
  description: 'Built in 2000. Rated for drops, floods, and apparently hydraulic presses.',
  material: { behavior: 'rigid' },
  failMessage: 'Nokia 3310: 1 — Hydraulic press: 0',
  credit: modelScene ? '"Nokia 3310" by Artemecia — CC BY 4.0' : null,
  build: () => (modelScene ? buildFromModel() : buildNokia()),

  // Optional hooks — every object can react to the press in its own way.
  onContact(ctx, obj) { obj.built.userData.setScreen('idle', 1); },
  onStrain(ctx, obj, k) {
    // Completely unbothered. Backlight stays on, clock keeps ticking.
  },
  onLanded(ctx, obj) { obj.built.userData.setScreen('victory', 1); },
};

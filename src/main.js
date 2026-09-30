import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { HydraulicPress } from './press.js';
import { PressObject } from './pressObject.js';
import { Simulation } from './simulation.js';
import { FX } from './fx/particles.js';
import { Debris } from './fx/debris.js';
import { SoundEngine } from './fx/audio.js';
import { Gauge } from './ui/gauge.js';
import { OBJECTS } from './objects/index.js';
import { initVisitorCounter } from './ui/visitorCounter.js';

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#d9d9d4');
scene.fog = new THREE.Fog('#d9d9d4', 220, 520);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 1, 1500);
camera.position.set(40, 36, 92);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 26, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 15;
controls.maxDistance = 260;

scene.add(new THREE.HemisphereLight('#ffffff', '#8a8a80', 0.6));
const key = new THREE.DirectionalLight('#fff6e8', 2.6);
key.position.set(40, 90, 60);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -70, right: 70, top: 80, bottom: -40, near: 10, far: 250 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.05;
scene.add(key);
const rim = new THREE.DirectionalLight('#dfe8ff', 1.2);
rim.position.set(-60, 40, -50);
scene.add(rim);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: '#cfcfca', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.4, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Systems + shared context passed to the press, simulation and object hooks
// ---------------------------------------------------------------------------

const fx = new FX(scene);
const debris = new Debris(scene);
const sound = new SoundEngine();
const gauge = new Gauge(document.getElementById('gauge'));
const statusEl = document.getElementById('status');
const flashEl = document.getElementById('flash');

const CAMS = {
  wide: { pos: [40, 36, 92], target: [0, 26, 0] },
  close: { pos: [14, 19, 46], target: [0, 15, 0] },
  chaos: { pos: [52, 42, 112], target: [0, 22, 0] },
};
const cam = { auto: true, preset: 'wide' };
let shake = 0, shakeHold = 0;
const slow = { factor: 1, until: 0 };

const ctx = {
  scene, fx, debris, sound, gauge,
  press: null, subject: null,
  groundAt: (x, z) => (Math.abs(x) < 22 && Math.abs(z) < 14 ? ctx.press.baseTop : 0),
  flash() {
    flashEl.style.transition = 'none';
    flashEl.style.opacity = 0.85;
    requestAnimationFrame(() => { flashEl.style.transition = 'opacity .7s ease-out'; flashEl.style.opacity = 0; });
  },
  shake(a) { shake = Math.max(shake, a); },
  setShake(a) { shakeHold = a; },
  slowmo(factor, seconds) { slow.factor = factor; slow.until = performance.now() + seconds * 1000; },
  setCam(name) { cam.preset = name; },
  setStatus(head, sub = '', cls = '') {
    statusEl.className = cls;
    statusEl.firstElementChild.textContent = head;
    statusEl.lastElementChild.textContent = sub;
  },
};
fx.groundAt = ctx.groundAt;
debris.groundAt = ctx.groundAt;

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const objSelect = $('object'), capInput = $('capacity'), tsInput = $('timescale');

for (const o of OBJECTS) objSelect.add(new Option(o.name, o.id));
const params = new URLSearchParams(location.search);
if (params.get('object')) objSelect.value = params.get('object');

function describe(subject) {
  const req = subject.requiredForce;
  const need = req === Infinity ? '∞ (does not yield)' : `${req < 1 ? req.toFixed(2) : Math.round(req)} t`;
  $('objInfo').innerHTML = `<span class="tag ${subject.behavior}">${subject.behavior.toUpperCase()}</span>${subject.def.description || ''}<br><b>Needs:</b> ${need}${subject.def.credit ? `<br><small style="opacity:.6">Model: ${subject.def.credit}</small>` : ''}`;
}

let sim;
function setup() {
  const def = OBJECTS.find((o) => o.id === objSelect.value) || OBJECTS[0];
  if (ctx.press) scene.remove(ctx.press.group);
  if (ctx.subject) ctx.subject.root.removeFromParent();
  debris.clear();
  fx.clear();
  sound.stopLoops();
  gauge.reset();
  shake = shakeHold = 0;

  ctx.press = new HydraulicPress();
  scene.add(ctx.press.group);
  ctx.subject = new PressObject(def);
  ctx.subject.place(scene, ctx.press.anvilTop);
  sim = new Simulation(ctx, +capInput.value);
  ctx.sim = sim;
  cam.preset = 'wide';
  cam.auto = $('autocam').checked;
  describe(ctx.subject);
  ctx.setStatus('READY', `${def.name} vs ${capInput.value} t press`);
}

objSelect.addEventListener('change', setup);
capInput.addEventListener('input', () => {
  $('capVal').textContent = `${capInput.value} t`;
  gauge.setCapacity(+capInput.value);
  if (sim && sim.state === 'idle') { sim.capacity = +capInput.value; ctx.setStatus('READY', `${ctx.subject.def.name} vs ${capInput.value} t press`); }
});
tsInput.addEventListener('input', () => { $('tsVal').textContent = `${(+tsInput.value).toFixed(2)}×`; });
$('go').addEventListener('click', () => sim.start());
$('reset').addEventListener('click', setup);
$('sound').addEventListener('change', (e) => sound.setEnabled(e.target.checked));
$('autocam').addEventListener('change', (e) => { cam.auto = e.target.checked; });
controls.addEventListener('start', () => { cam.auto = false; $('autocam').checked = false; });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); sim.start(); }
  if (e.code === 'KeyR') setup();
});

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fx.setScale((innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
}
addEventListener('resize', resize);
resize();

capInput.dispatchEvent(new Event('input'));
setup();
void initVisitorCounter();

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

const shakeOffset = new THREE.Vector3();
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
let last = performance.now();
let timeScaleSmooth = 1;

function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const slowTarget = now < slow.until ? slow.factor : 1;
  timeScaleSmooth += (slowTarget - timeScaleSmooth) * Math.min(1, realDt * (slowTarget < timeScaleSmooth ? 30 : 2.5));
  const dt = realDt * +tsInput.value * timeScaleSmooth;

  sim.update(dt);
  fx.update(dt);
  debris.update(dt);
  gauge.set(sim.force);
  gauge.update(realDt);
  $('go').disabled = sim.state !== 'idle';

  if (cam.auto) {
    const p = CAMS[cam.preset], k = 1 - Math.exp(-realDt * 1.4);
    camera.position.lerp(camPos.fromArray(p.pos), k);
    controls.target.lerp(camTarget.fromArray(p.target), k);
  }
  controls.update();

  shake *= Math.exp(-realDt * 3);
  const s = shake + shakeHold;
  shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  camera.position.add(shakeOffset);
  composer.render();
  camera.position.sub(shakeOffset);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging from the console
Object.assign(window, { THREE, scene, ctx, camera, controls, renderer, composer });

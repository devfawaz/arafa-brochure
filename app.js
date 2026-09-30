import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Real proportions: each panel is 9.33 x 21 cm, paper about 0.3 mm thick (exaggerated a little so the edge reads).
const H = 1, W = H * 9.333 / 21, T = 0.0045;
const OPEN_ANGLE = THREE.MathUtils.degToRad(16);

const canvas = document.getElementById('gl');
const stage = document.getElementById('stage');
const loading = document.getElementById('loading');
const nextBtn = document.getElementById('nextBtn'), nextLabel = document.getElementById('nextLabel'), prevBtn = document.getElementById('prevBtn');
const dots = [...document.querySelectorAll('.steps i')], status = document.getElementById('status');
const flipBtn = document.getElementById('flipBtn'), resetBtn = document.getElementById('resetBtn');
const hint = document.getElementById('hint');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Renderer: transparent so the CSS studio sweep shows through; colour-managed so print colours stay true.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

// Lighting: soft sky fill plus one warm key from the front-left, like a window in a studio.
scene.add(new THREE.HemisphereLight(0xfffaf0, 0xe0d0b0, 2.7));
const key = new THREE.DirectionalLight(0xfff4e2, 1.2);
key.position.set(-1.6, 2.4, 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 10;
key.shadow.blurSamples = 20;
key.shadow.bias = -0.0004;
Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.6, bottom: -0.4, near: 0.5, far: 6 });
scene.add(key);

// Floor that only shows shadows, plus a soft contact shadow right under the paper.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function contactTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(45,30,10,.55)'); r.addColorStop(.5, 'rgba(45,30,10,.18)'); r.addColorStop(1, 'rgba(45,30,10,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false }));
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.0005;
scene.add(contact);

// Textures for both languages, loaded up front so switching is instant.
const loader = new THREE.TextureLoader();
const keys = ['in-0', 'in-1', 'in-2', 'out-0', 'out-1', 'out-2'];
const tex = { en: {}, ar: {} };
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const loads = [];
for (const lang of ['en', 'ar']) for (const k of keys) {
  loads.push(new Promise(res => loader.load(`img/${lang}-${k}.jpg`, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; tex[lang][k] = t; res();
  })));
}

// A panel is a thin box: printed front and back, plain paper edges.
const edge = new THREE.MeshStandardMaterial({ color: 0xf1ebdf, roughness: .9 });
function panel(frontKey, backKey) {
  const front = new THREE.MeshStandardMaterial({ roughness: .78, metalness: 0 });
  const back = new THREE.MeshStandardMaterial({ roughness: .78, metalness: 0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [edge, edge, edge, edge, front, back]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData = { front, back, frontKey, backKey };
  return m;
}

// Tri-fold, seen from the inside: left | middle | right.
// Outside of the sheet (as printed): flap | back panel | cover, so the cover is the back of the left panel.
const brochure = new THREE.Group();        // turns over
const holder = new THREE.Group();          // sits on the floor
holder.add(brochure);
scene.add(holder);

const mid = panel('in-1', 'out-1');
brochure.add(mid);
// Hinges sit on the printed front surface, so the printed faces meet exactly along each crease when open.
// Right flap folds in first; the cover panel folds over it, lifted by a paper thickness only as it folds.
const rightHinge = new THREE.Group(); rightHinge.position.set(W / 2, 0, T / 2);
const right = panel('in-2', 'out-0'); right.position.set(W / 2, 0, -T / 2);
rightHinge.add(right); brochure.add(rightHinge);
const leftHinge = new THREE.Group(); leftHinge.position.set(-W / 2, 0, T / 2);
const left = panel('in-0', 'out-2'); left.position.set(-W / 2, 0, -T / 2);
leftHinge.add(left); brochure.add(leftHinge);
// A paper spine along each crease fills the hairline wedge on the outside of the fold.
for (const x of [-W / 2, W / 2]) {
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(T / 2, T / 2, H, 12), edge);
  spine.position.set(x, 0, 0); spine.castShadow = true; brochure.add(spine);
}
const panels = [mid, right, left];

// Pages, opened one at a time: 0 closed (cover), 1 cover opened, 2 fully open (inside spread).
const STEPS = [
  { left: Math.PI - 0.002, right: -Math.PI + 0.002, spread: 0, next: 'Open', say: 'Closed, front cover' },
  { left: OPEN_ANGLE, right: -Math.PI + 0.002, spread: .5, next: 'Next page', say: 'Cover opened' },
  { left: OPEN_ANGLE, right: -OPEN_ANGLE, spread: 1, next: 'Close', say: 'Fully open, inside spread' },
];
const state = { step: 0, flipped: false, lang: 'en' };
const anim = {
  left: { v: STEPS[0].left, to: STEPS[0].left, delay: 0 },
  right: { v: STEPS[0].right, to: STEPS[0].right, delay: 0 },
  turn: { v: 0, to: 0, delay: 0 },
  spread: { v: 0, to: 0, delay: 0 },
};

function applyTextures() {
  for (const p of panels) {
    const { front, back, frontKey, backKey } = p.userData;
    front.map = tex[state.lang][frontKey]; back.map = tex[state.lang][backKey];
    front.needsUpdate = back.needsUpdate = true;
  }
}

function go(step) {
  step = Math.max(0, Math.min(STEPS.length - 1, step));
  const from = state.step; state.step = step;
  const t = STEPS[step], now = clock.elapsedTime;
  // Closing all the way from the inside spread folds the flap in first, then the cover over it.
  const closingBoth = from === 2 && step === 0;
  anim.left.to = t.left; anim.left.delay = closingBoth ? .4 : 0;
  anim.right.to = t.right; anim.right.delay = 0;
  anim.spread.to = t.spread; anim.spread.delay = 0;
  for (const a of [anim.left, anim.right, anim.spread]) a.start = now, a.from = a.v;
  ui();
}
function next() { go(state.step === STEPS.length - 1 ? 0 : state.step + 1); }
function setFlipped(f) {
  state.flipped = f;
  anim.turn.to = f ? Math.PI : 0; anim.turn.start = clock.elapsedTime; anim.turn.from = anim.turn.v; anim.turn.delay = 0;
  ui();
}
function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  applyTextures(); ui();
}
function ui() {
  nextLabel.textContent = STEPS[state.step].next;
  prevBtn.disabled = state.step === 0;
  dots.forEach((d, i) => d.classList.toggle('on', i === state.step));
  const lang = state.lang === 'ar' ? 'Arabic' : 'English';
  const say = `${STEPS[state.step].say}${state.flipped ? ', turned over' : ''}, ${lang}`;
  canvas.setAttribute('aria-label', `Arafa Homes brochure. ${say}.`);
  status.textContent = say;
}

// Camera: orbit with damping, no zoom or pan, kept above the floor.
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .06;
controls.enablePan = false; controls.enableZoom = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(58); controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.minAzimuthAngle = THREE.MathUtils.degToRad(-60); controls.maxAzimuthAngle = THREE.MathUtils.degToRad(60);
controls.rotateSpeed = .55;
controls.target.set(0, H / 2, 0);
const home = { az: THREE.MathUtils.degToRad(-16), polar: THREE.MathUtils.degToRad(80) };
let fit = { closed: 2, open: 3 };
const distFor = spread => fit.closed + (fit.open - fit.closed) * spread;

function frame() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Fit the open spread (about 3 panels wide) or the closed brochure, with room for the header and toolbar.
  const vFov = THREE.MathUtils.degToRad(camera.fov), k = 1 / 2 / Math.tan(vFov / 2);
  const fitH = H * 1.6 * k;
  fit = { closed: Math.max(fitH, W * 2.1 * k / camera.aspect), open: Math.max(fitH, W * 3.7 * k / camera.aspect) };
  camera.updateProjectionMatrix();
}
function placeCamera(az, polar) {
  camera.position.setFromSphericalCoords(distFor(anim.spread.v), polar, az).add(controls.target);
  camera.lookAt(controls.target);
}
function resetView() {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  resetAnim = { t0: clock.elapsedTime, az0: s.theta, p0: s.phi };
}
let resetAnim = null;

// Tap on the paper opens or closes it; dragging orbits.
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; stage.classList.add('dragging'); });
addEventListener('pointerup', e => {
  stage.classList.remove('dragging');
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
  down = null;
  if (moved) { hint.classList.add('gone'); return; }
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObjects(panels, false).length) next();
});
controls.addEventListener('start', () => { resetAnim = null; });

nextBtn.addEventListener('click', next);
prevBtn.addEventListener('click', () => go(state.step - 1));
flipBtn.addEventListener('click', () => setFlipped(!state.flipped));
resetBtn.addEventListener('click', resetView);
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('button')) return;
  const k = e.key.toLowerCase();
  if (k === 'enter' || k === ' ' || k === 'arrowright') { e.preventDefault(); next(); }
  else if (k === 'arrowleft' || k === 'backspace') go(state.step - 1);
  else if (k === 't') setFlipped(!state.flipped);
  else if (k === 'l') setLang(state.lang === 'en' ? 'ar' : 'en');
});

// Easing and the render loop.
const clock = new THREE.Clock();
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function step(a, dur) {
  if (a.start == null) return;
  const t = reduceMotion ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - a.start - a.delay) / dur));
  a.v = a.from + (a.to - a.from) * ease(t);
  if (t >= 1) a.start = null;
}
function tick() {
  clock.getDelta();
  step(anim.left, .95); step(anim.right, .95); step(anim.turn, 1.1); step(anim.spread, 1.1);
  leftHinge.rotation.y = anim.left.v;
  // Lift the cover panel's hinge by a paper thickness only as it folds over the flap; zero when flat.
  leftHinge.position.z = T / 2 + T * 1.25 * Math.max(0, (anim.left.v - OPEN_ANGLE) / (Math.PI - OPEN_ANGLE));
  rightHinge.rotation.y = anim.right.v;
  // Turning over: spin around the middle panel and lift a touch so the paper never scrapes the floor.
  brochure.rotation.y = anim.turn.v;
  holder.position.y = H / 2 + Math.sin(anim.turn.v) * .05;
  // Contact shadow widens as the brochure opens.
  const s = 1 + anim.spread.v * 1.6;
  contact.scale.set(W * 1.5 * s, .32, 1);
  if (resetAnim) {
    const t = Math.min(1, (clock.elapsedTime - resetAnim.t0) / .9), k = ease(t);
    placeCamera(resetAnim.az0 + (home.az - resetAnim.az0) * k, resetAnim.p0 + (home.polar - resetAnim.p0) * k);
    if (t >= 1) resetAnim = null;
  }
  // Dolly in or out with the fold so the brochure always fills the frame.
  const off = camera.position.clone().sub(controls.target);
  off.setLength(distFor(anim.spread.v));
  camera.position.copy(controls.target).add(off);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Deep links: ?lang=ar and ?open=1.
const qs = new URLSearchParams(location.search);
addEventListener('resize', () => { frame(); controls.update(); });

Promise.all(loads).then(() => {
  frame();
  placeCamera(home.az, home.polar);
  if (qs.get('lang') === 'ar') setLang('ar'); else applyTextures();
  if (qs.get('open') === '1') go(2);
  ui();
  loading.classList.add('gone');
  tick();
});

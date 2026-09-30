import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Real proportions: each panel is 9.33 x 21 cm, paper about 0.3 mm thick (exaggerated a little so the edge reads).
const H = 1, W = H * 9.333 / 21, T = 0.0045;
const OPEN_ANGLE = THREE.MathUtils.degToRad(16);

const canvas = document.getElementById('gl');
const stage = document.getElementById('stage');
const loading = document.getElementById('loading');
const nextBtn = document.getElementById('nextBtn'), nextLabel = document.getElementById('nextLabel'), prevBtn = document.getElementById('prevBtn');
const status = document.getElementById('status');
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
// Edges that meet at a crease are navy, like the print on the outside of each fold, so no paper line shows there.
const creaseEdge = new THREE.MeshStandardMaterial({ color: 0x141b38, roughness: .8 });
function panel(frontKey, backKey, { plusX = edge, minusX = edge } = {}) {
  const front = new THREE.MeshStandardMaterial({ roughness: .78, metalness: 0 });
  const back = new THREE.MeshStandardMaterial({ roughness: .78, metalness: 0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [plusX, minusX, edge, edge, front, back]);
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

const mid = panel('in-1', 'out-1', { plusX: creaseEdge, minusX: creaseEdge });
brochure.add(mid);
// Hinges sit on the printed front surface, so the printed faces meet exactly along each crease when open.
// Right flap folds in first; the cover panel folds over it, lifted by a paper thickness only as it folds.
const rightHinge = new THREE.Group(); rightHinge.position.set(W / 2, 0, T / 2);
const right = panel('in-2', 'out-0', { minusX: creaseEdge }); right.position.set(W / 2, 0, -T / 2);
rightHinge.add(right); brochure.add(rightHinge);
const leftHinge = new THREE.Group(); leftHinge.position.set(-W / 2, 0, T / 2);
const left = panel('in-0', 'out-2', { plusX: creaseEdge }); left.position.set(-W / 2, 0, -T / 2);
leftHinge.add(left); brochure.add(leftHinge);
// A spine along each crease fills the hairline wedge on the outside of the fold. It's navy, the colour
// printed on both sides of each outside crease, and sits just behind the inside surface so it never shows there.
const spineMat = creaseEdge;
for (const x of [-W / 2, W / 2]) {
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(T * .46, T * .46, H * .999, 12), spineMat);
  spine.position.set(x, 0, -T * .06); brochure.add(spine);
}
const panels = [mid, right, left];

// Folds: closed, cover opened, fully open.
const FOLD = {
  closed: { left: Math.PI - 0.002, right: -Math.PI + 0.002, spread: 0 },
  cover: { left: OPEN_ANGLE, right: -Math.PI + 0.002, spread: .5 },
  open: { left: OPEN_ANGLE, right: -OPEN_ANGLE, spread: 1 },
};
// Where each page sits once open, and the angle that faces it square on.
const cosA = Math.cos(OPEN_ANGLE), sinA = Math.sin(OPEN_ANGLE), deg = THREE.MathUtils.degToRad;
const PAGE = {
  cover: { x: 0, z: T, az: deg(-16) },
  flap: { x: 0, z: T * 2, az: deg(-8) },
  left: { x: -W / 2 - W / 2 * cosA, z: W / 2 * sinA, az: OPEN_ANGLE + deg(2) },
  mid: { x: 0, z: 0, az: deg(0) },
  right: { x: W / 2 + W / 2 * cosA, z: W / 2 * sinA, az: -OPEN_ANGLE - deg(2) },
  back: { x: 0, z: 0, az: deg(16) },
};
// Reading order, one page per step. Arabic reads the inside right to left.
function steps(lang) {
  const inside = lang === 'ar' ? ['right', 'mid', 'left'] : ['left', 'mid', 'right'];
  return [
    { fold: 'closed', flip: false, page: 'cover', next: 'Open', say: 'Front cover' },
    { fold: 'cover', flip: false, page: 'flap', next: 'Next page', say: 'Welcome flap' },
    { fold: 'open', flip: false, page: inside[0], next: 'Next page', say: 'Inside, page 1 of 3' },
    { fold: 'open', flip: false, page: inside[1], next: 'Next page', say: 'Inside, page 2 of 3' },
    { fold: 'open', flip: false, page: inside[2], next: 'Close', say: 'Inside, page 3 of 3' },
    { fold: 'closed', flip: true, page: 'back', next: 'Start again', say: 'Back cover' },
  ];
}
let STEPS = steps('en');
const dotsWrap = document.querySelector('.steps');
dotsWrap.innerHTML = STEPS.map(() => '<i></i>').join('');
const dotEls = [...dotsWrap.children];

const state = { step: 0, flipped: false, lang: 'en', fold: 'closed' };
const anim = {
  left: { v: FOLD.closed.left, to: FOLD.closed.left, delay: 0 },
  right: { v: FOLD.closed.right, to: FOLD.closed.right, delay: 0 },
  turn: { v: 0, to: 0, delay: 0 },
  spread: { v: 0, to: 0, delay: 0 },
};
const tween = (a, to, delay, now) => { a.from = a.v; a.to = to; a.delay = delay; a.start = now; };

function applyTextures() {
  for (const p of panels) {
    const { front, back, frontKey, backKey } = p.userData;
    front.map = tex[state.lang][frontKey]; back.map = tex[state.lang][backKey];
    front.needsUpdate = back.needsUpdate = true;
  }
}

// Move the paper in order: turn back first if needed, cover before flap when opening, flap before cover when closing.
function fold(to, flip) {
  const now = clock.elapsedTime, from = FOLD[state.fold], f = FOLD[to];
  let t = 0;
  if (state.flipped && !flip) { tween(anim.turn, 0, 0, now); t = 1.0; state.flipped = false; }
  const openLeft = f.left < from.left - .01, closeLeft = f.left > from.left + .01;
  const openRight = f.right > from.right + .01, closeRight = f.right < from.right - .01;
  if (openLeft || openRight) {
    if (openLeft) { tween(anim.left, f.left, t, now); t += .35; }
    if (openRight) { tween(anim.right, f.right, t, now); t += .35; }
  } else if (closeLeft || closeRight) {
    if (closeRight) { tween(anim.right, f.right, t, now); t += .45; }
    if (closeLeft) { tween(anim.left, f.left, t, now); t += .6; }
  }
  tween(anim.spread, f.spread, 0, now);
  if (flip && !state.flipped) { tween(anim.turn, Math.PI, t, now); state.flipped = true; }
  state.fold = to;
}

function go(i, instant = false) {
  i = (i + STEPS.length) % STEPS.length;
  state.step = i;
  const s = STEPS[i];
  fold(s.fold, s.flip);
  lookAt(s.page, instant);
  ui();
}
const next = () => go(state.step + 1);
const prev = () => { if (state.step > 0) go(state.step - 1); };

function setFlipped(f) {
  state.flipped = f;
  tween(anim.turn, f ? Math.PI : 0, 0, clock.elapsedTime);
  ui();
}
function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang; STEPS = steps(lang);
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  applyTextures();
  lookAt(STEPS[state.step].page);
  ui();
}
function ui() {
  const s = STEPS[state.step];
  nextLabel.textContent = s.next;
  prevBtn.disabled = state.step === 0;
  dotEls.forEach((d, i) => d.classList.toggle('on', i === state.step));
  const say = `${s.say}, ${state.lang === 'ar' ? 'Arabic' : 'English'}`;
  canvas.setAttribute('aria-label', `Arafa Homes brochure. ${say}.`);
  status.textContent = say;
}

// Camera: orbit with damping, no zoom or pan. Each step glides to one page, square on.
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .06;
controls.enablePan = false; controls.enableZoom = false;
controls.minPolarAngle = deg(58); controls.maxPolarAngle = deg(88);
controls.minAzimuthAngle = deg(-70); controls.maxAzimuthAngle = deg(70);
controls.rotateSpeed = .55;
controls.target.set(0, H / 2, 0);
const POLAR = deg(82);
let pageDist = 2;

function frame() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // One page fills the frame, leaving room for the header and toolbar.
  const k = 1 / 2 / Math.tan(deg(camera.fov) / 2);
  pageDist = Math.max(H * 1.42 * k, W * 1.9 * k / camera.aspect);
}
let cam = null;
function lookAt(name, instant = false) {
  const p = PAGE[name];
  const target = new THREE.Vector3(p.x, H / 2, p.z);
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  cam = { t0: clock.elapsedTime, dur: instant ? 0 : 1.25,
    from: { target: controls.target.clone(), r: sph.radius, phi: sph.phi, theta: sph.theta },
    to: { target, r: pageDist, phi: POLAR, theta: p.az } };
}
const resetView = () => lookAt(STEPS[state.step].page);

// Tap on the paper turns the page; dragging looks around.
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
controls.addEventListener('start', () => { cam = null; });

nextBtn.addEventListener('click', next);
prevBtn.addEventListener('click', prev);
flipBtn.addEventListener('click', () => setFlipped(!state.flipped));
resetBtn.addEventListener('click', resetView);
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('button')) return;
  const k = e.key.toLowerCase();
  if (k === 'enter' || k === ' ' || k === 'arrowright') { e.preventDefault(); next(); }
  else if (k === 'arrowleft' || k === 'backspace') prev();
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
  contact.scale.set(W * 1.5 * (1 + anim.spread.v * 1.6), .32, 1);
  if (cam) {
    const t = reduceMotion || !cam.dur ? 1 : Math.min(1, (clock.elapsedTime - cam.t0) / cam.dur), k = ease(t);
    const { from: a, to: b } = cam;
    controls.target.lerpVectors(a.target, b.target, k);
    camera.position.setFromSphericalCoords(a.r + (b.r - a.r) * k, a.phi + (b.phi - a.phi) * k, a.theta + (b.theta - a.theta) * k).add(controls.target);
    if (t >= 1) cam = null;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Deep links: ?lang=ar, and ?page=N to start on a page (1 is the cover).
const qs = new URLSearchParams(location.search);
addEventListener('resize', () => { frame(); lookAt(STEPS[state.step].page, true); });

Promise.all(loads).then(() => {
  frame();
  camera.position.setFromSphericalCoords(pageDist, POLAR, PAGE.cover.az).add(controls.target);
  if (qs.get('lang') === 'ar') setLang('ar'); else applyTextures();
  const start = Math.max(1, Math.min(STEPS.length, +qs.get('page') || 1)) - 1;
  go(start, true);
  if (start) { for (const a of Object.values(anim)) { a.v = a.to; a.start = null; } }
  loading.classList.add('gone');
  tick();
});

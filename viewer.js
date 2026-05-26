import * as THREE from 'three';

// ── Renderer / scene / camera ──────────────────────────────────────────────────
const container = document.getElementById('viewer-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

// ── Panorama sphere (normals flipped inward) ───────────────────────────────────
const geometry = new THREE.SphereGeometry(500, 64, 32);
geometry.scale(-1, 1, 1);
const material = new THREE.MeshBasicMaterial({ map: buildPlaceholderTexture() });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// ── Image slots ────────────────────────────────────────────────────────────────
// Each slot stores the blob URL. We only keep ONE decoded THREE.Texture in GPU
// memory at a time — the rest stay as cheap blob URLs until needed.
const MAX_IMAGES = 3;
const slots = [null, null, null]; // blob URL strings
let currentIndex = 0;
let isLoading = false;

// ── Camera state ───────────────────────────────────────────────────────────────
const rot    = { x: 0, y: 0 };
const target = { x: 0, y: 0 };
const fov    = { cur: 75, tgt: 75, min: 20, max: 105 };
const SMOOTH     = 0.10;
const ROT_SPEED  = 0.0030;
const ZOOM_SPEED = 0.08;

let autoRotate = true;
const AUTO_ROT_SPEED = 0.0003;

// ── Mouse drag ────────────────────────────────────────────────────────────────
let dragging = false;
let lastX = 0, lastY = 0;
const cv = renderer.domElement;
cv.style.cursor = 'grab';

cv.addEventListener('mousedown', e => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  cv.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
  dragging = false;
  cv.style.cursor = 'grab';
});

window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  target.y -= dx * ROT_SPEED;
  target.x -= dy * ROT_SPEED;
  target.x = clamp(target.x, -Math.PI / 2, Math.PI / 2);
});

// ── Scroll / pinch zoom ────────────────────────────────────────────────────────
cv.addEventListener('wheel', e => {
  e.preventDefault();
  fov.tgt += e.deltaY * 0.05;
  fov.tgt = clamp(fov.tgt, fov.min, fov.max);
}, { passive: false });

// ── Touch ─────────────────────────────────────────────────────────────────────
let lastTouchX = 0, lastTouchY = 0, lastPinchDist = 0;

cv.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    lastPinchDist = pinchDist(e);
  }
}, { passive: false });

cv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - lastTouchX;
    const dy = e.touches[0].clientY - lastTouchY;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    target.y -= dx * ROT_SPEED;
    target.x -= dy * ROT_SPEED;
    target.x = clamp(target.x, -Math.PI / 2, Math.PI / 2);
  } else if (e.touches.length === 2) {
    const d = pinchDist(e);
    fov.tgt += (lastPinchDist - d) * 0.15;
    fov.tgt = clamp(fov.tgt, fov.min, fov.max);
    lastPinchDist = d;
  }
}, { passive: false });

// ── Keyboard ──────────────────────────────────────────────────────────────────
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.key);
  if (e.key === 'ArrowLeft'  && !e.ctrlKey && !e.metaKey) navigateTo(currentIndex - 1);
  if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) navigateTo(currentIndex + 1);
});
window.addEventListener('keyup', e => keys.delete(e.key));

function applyKeyboard() {
  const step = 0.018;
  if (keys.has('a') || keys.has('A')) target.y += step;
  if (keys.has('d') || keys.has('D')) target.y -= step;
  if (keys.has('w') || keys.has('W')) target.x = clamp(target.x + step, -Math.PI / 2, Math.PI / 2);
  if (keys.has('s') || keys.has('S')) target.x = clamp(target.x - step, -Math.PI / 2, Math.PI / 2);
}

// ── Navigation ────────────────────────────────────────────────────────────────
const navEl   = document.getElementById('nav');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const dotEls  = Array.from(document.querySelectorAll('.dot'));

prevBtn.addEventListener('click', () => navigateTo(currentIndex - 1));
nextBtn.addEventListener('click', () => navigateTo(currentIndex + 1));
dotEls.forEach(dot => dot.addEventListener('click', () => navigateTo(Number(dot.dataset.index))));

function navigateTo(index) {
  const filled = slots.filter(Boolean).length;
  if (filled < 2 || isLoading) return;
  // Wrap around within the loaded range only
  const maxLoaded = filled - 1;
  index = ((index % filled) + filled) % filled;
  if (index === currentIndex) return;
  currentIndex = index;
  applyCurrentSlot();
}

function applyCurrentSlot() {
  const url = slots[currentIndex];
  if (!url) return;

  showLoading(true);
  // Dispose the old texture to free GPU memory before loading the next one
  if (material.map && material.map.isCanvasTexture === undefined) {
    material.map.dispose();
  }

  new THREE.TextureLoader().load(
    url,
    tex => {
      material.map = tex;
      material.needsUpdate = true;
      showLoading(false);
      updateNav();
    },
    undefined,
    () => showLoading(false)
  );
}

function updateNav() {
  const filled = slots.filter(Boolean).length;
  navEl.classList.toggle('visible', filled >= 2);

  dotEls.forEach((dot, i) => {
    dot.classList.toggle('loaded', Boolean(slots[i]));
    dot.classList.toggle('active', i === currentIndex);
    // Hide dots for slots that will never be used if < 3 images loaded
    dot.style.display = (i < MAX_IMAGES) ? '' : 'none';
  });

  // Dim dots for empty slots
  dotEls.forEach((dot, i) => {
    dot.style.opacity = slots[i] ? '1' : '0.25';
  });

  prevBtn.disabled = false;
  nextBtn.disabled = false;
}

// ── File loading ───────────────────────────────────────────────────────────────
const loadBtn   = document.getElementById('load-btn');
const fileInput = document.getElementById('file-input');

loadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  handleFiles(Array.from(e.target.files));
  fileInput.value = '';
});

function handleFiles(files) {
  // Accept up to MAX_IMAGES; fill slots starting from the first empty one,
  // or overwrite from slot 0 if all are already filled.
  const imageFiles = files.filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
  if (!imageFiles.length) return;

  // Revoke old blob URLs to release memory before replacing
  const firstEmpty = slots.findIndex(s => !s);
  const startSlot  = firstEmpty === -1 ? 0 : firstEmpty;

  imageFiles.forEach((file, i) => {
    const slotIndex = (startSlot + i) % MAX_IMAGES;
    if (slots[slotIndex]) URL.revokeObjectURL(slots[slotIndex]);
    slots[slotIndex] = URL.createObjectURL(file);
  });

  // Jump to the first newly loaded slot and display it
  currentIndex = startSlot % MAX_IMAGES;
  applyCurrentSlot();
}

// ── Drag-and-drop ──────────────────────────────────────────────────────────────
const dropOverlay = document.getElementById('dropzone-overlay');
let dragCounter = 0;

document.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('active');
});

document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('active');
  handleFiles(Array.from(e.dataTransfer.files));
});

// ── Auto-rotate toggle ─────────────────────────────────────────────────────────
const autoBtn = document.getElementById('autorotate-btn');
autoBtn.addEventListener('click', () => {
  autoRotate = !autoRotate;
  autoBtn.classList.toggle('active', autoRotate);
});

// ── Resize ─────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Loading overlay ────────────────────────────────────────────────────────────
const loadingOverlay = document.getElementById('loading-overlay');

function showLoading(on) {
  isLoading = on;
  loadingOverlay.classList.toggle('visible', on);
}

// ── Animation loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  applyKeyboard();

  if (autoRotate && !dragging) target.y -= AUTO_ROT_SPEED;

  rot.x += (target.x - rot.x) * SMOOTH;
  rot.y += (target.y - rot.y) * SMOOTH;

  fov.cur += (fov.tgt - fov.cur) * ZOOM_SPEED;
  camera.fov = fov.cur;
  camera.updateProjectionMatrix();

  camera.rotation.x = rot.x;
  camera.rotation.y = rot.y;

  renderer.render(scene, camera);
}

animate();

// ── Helpers ────────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pinchDist(e) {
  return Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
  );
}

// ── Placeholder texture ────────────────────────────────────────────────────────
function buildPlaceholderTexture() {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.58);
  sky.addColorStop(0,   '#0b0f1a');
  sky.addColorStop(0.5, '#0d1b3e');
  sky.addColorStop(1,   '#1a3a6b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.58);

  const ground = ctx.createLinearGradient(0, H * 0.58, 0, H);
  ground.addColorStop(0, '#1c3a10');
  ground.addColorStop(1, '#0e1f08');
  ctx.fillStyle = ground;
  ctx.fillRect(0, H * 0.58, W, H * 0.42);

  const glow = ctx.createLinearGradient(0, H * 0.46, 0, H * 0.68);
  glow.addColorStop(0,   'transparent');
  glow.addColorStop(0.4, 'rgba(255,120,40,0.18)');
  glow.addColorStop(0.6, 'rgba(255,80,10,0.12)');
  glow.addColorStop(1,   'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, H * 0.46, W, H * 0.22);

  const rng = mulberry32(42);
  for (let i = 0; i < 320; i++) {
    const x = rng() * W, y = rng() * H * 0.54;
    const r = rng() * 1.6 + 0.3, a = rng() * 0.6 + 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(80,160,60,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const x = (i / 20) * W;
    ctx.beginPath(); ctx.moveTo(x, H * 0.58); ctx.lineTo(W / 2, H); ctx.stroke();
  }
  for (let j = 0; j < 8; j++) {
    const y = H * 0.58 + (j / 8) * H * 0.42;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  drawText(ctx, 'Load up to 3 panoramic images', W / 2, H / 2 - 14, 'bold 40px sans-serif', 'rgba(255,255,255,0.80)');
  drawText(ctx, 'Click “Load Images” or drag & drop up to 3 files', W / 2, H / 2 + 44, '26px sans-serif', 'rgba(255,255,255,0.45)');

  return new THREE.CanvasTexture(canvas);
}

function drawText(ctx, text, x, y, font, color) {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

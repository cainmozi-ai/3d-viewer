// Raw WebGL 360° panoramic viewer — no dependencies

// ── Canvas + WebGL context ─────────────────────────────────────────────────────
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
document.getElementById('viewer-container').appendChild(canvas);
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;

const gl = canvas.getContext('webgl', { antialias: false }) ||
           canvas.getContext('experimental-webgl', { antialias: false });

if (!gl) {
  const err = document.getElementById('webgl-error');
  if (err) err.style.display = 'flex';
  throw new Error('WebGL not available');
}

// ── Shaders ────────────────────────────────────────────────────────────────────
const VS = `
  attribute vec3 aPos;
  attribute vec2 aUV;
  uniform mat4 uMVP;
  varying vec2 vUV;
  void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
    vUV = aUV;
  }`;

const FS = `
  precision mediump float;
  uniform sampler2D uTex;
  varying vec2 vUV;
  void main() {
    gl_FragColor = texture2D(uTex, vUV);
  }`;

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
gl.useProgram(prog);

const aPos = gl.getAttribLocation(prog, 'aPos');
const aUV  = gl.getAttribLocation(prog, 'aUV');
const uMVP = gl.getUniformLocation(prog, 'uMVP');
const uTex = gl.getUniformLocation(prog, 'uTex');

// ── Sphere geometry (inside-out so texture faces inward) ───────────────────────
(function buildSphere() {
  const H = 64, V = 32; // horizontal / vertical segments
  const pos = [], uvs = [], idx = [];

  for (let i = 0; i <= V; i++) {
    const phi = (i / V) * Math.PI;
    for (let j = 0; j <= H; j++) {
      const theta = (j / H) * 2 * Math.PI;
      // Negate X to flip normals inward
      pos.push(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      uvs.push(j / H, 1 - i / V);
    }
  }

  for (let i = 0; i < V; i++) {
    for (let j = 0; j < H; j++) {
      const a = i * (H + 1) + j, b = a + H + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  window._spherePosBuf = pb;

  const ub = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ub);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  window._sphereUVBuf = ub;

  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  window._sphereIdxBuf = ib;
  window._sphereIdxCount = idx.length;
})();

// ── Matrix helpers ─────────────────────────────────────────────────────────────
function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r + k * 4] * b[k + c * 4];
      o[r + c * 4] = s;
    }
  return o;
}

function perspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan(fovDeg * Math.PI / 360);
  const o = new Float32Array(16);
  o[0]  = f / aspect;
  o[5]  = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = 2 * far * near / (near - far);
  return o;
}

// Rotation Ry * Rx stored in column-major order
function viewMatrix(ry, rx) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const o = new Float32Array(16);
  o[0]=cy;      o[4]=sy*sx;   o[8] =sy*cx;  o[12]=0;
  o[1]=0;       o[5]=cx;      o[9] =-sx;    o[13]=0;
  o[2]=-sy;     o[6]=cy*sx;   o[10]=cy*cx;  o[14]=0;
  o[3]=0;       o[7]=0;       o[11]=0;      o[15]=1;
  return o;
}

// ── Texture helpers ────────────────────────────────────────────────────────────
const MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);

function imageToTexture(img) {
  let src = img;
  if (img.naturalWidth > MAX_TEX || img.naturalHeight > MAX_TEX) {
    const s = Math.min(MAX_TEX / img.naturalWidth, MAX_TEX / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width  = Math.floor(img.naturalWidth  * s);
    c.height = Math.floor(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    src = c;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

// ── Image / slot state ─────────────────────────────────────────────────────────
// Replaced with embedded data URIs by the offline build script
const DEFAULT_IMAGES = [
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE0440.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE1771.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE2846.png',
];

const slots = [null, null, null];
let currentIndex  = 0;
let activeTexture = null;
let isLoading     = false;

function applyImg(img) {
  if (activeTexture) gl.deleteTexture(activeTexture);
  activeTexture = imageToTexture(img);
  showLoading(false);
  updateNav();
}

function applyCurrentSlot() {
  const src = slots[currentIndex];
  if (!src) return;
  showLoading(true);
  targetX = 0; targetY = 0;

  // '#id' = pre-embedded <img> element (offline build)
  if (src.startsWith('#')) {
    const img = document.querySelector(src);
    if (!img) { showLoading(false); return; }
    if (img.complete && img.naturalWidth) {
      applyImg(img);
    } else {
      img.onload  = () => applyImg(img);
      img.onerror = () => showLoading(false);
    }
  } else {
    const img = new Image();
    img.onload  = () => applyImg(img);
    img.onerror = () => showLoading(false);
    img.src = src;
  }
}

// ── Camera state ───────────────────────────────────────────────────────────────
let rotX = 0, rotY = 0, targetX = 0, targetY = 0;
let fov = 75, targetFov = 75;
const SMOOTH = 0.10, ROT_SPEED = 0.003, AUTO_SPEED = 0.0003;
let autoRotate = true, dragging = false, lastX = 0, lastY = 0;

// ── Mouse ──────────────────────────────────────────────────────────────────────
canvas.style.cursor = 'grab';
canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
window.addEventListener('mouseup',   () => { dragging = false; canvas.style.cursor = 'grab'; });
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  targetY -= (e.clientX - lastX) * ROT_SPEED;
  targetX -= (e.clientY - lastY) * ROT_SPEED;
  targetX  = clamp(targetX, -Math.PI / 2, Math.PI / 2);
  lastX = e.clientX; lastY = e.clientY;
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  targetFov = clamp(targetFov + e.deltaY * 0.05, 20, 105);
}, { passive: false });

// ── Touch ──────────────────────────────────────────────────────────────────────
let ltx = 0, lty = 0, lpinch = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) { ltx = e.touches[0].clientX; lty = e.touches[0].clientY; }
  if (e.touches.length === 2) lpinch = touchDist(e);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    targetY -= (e.touches[0].clientX - ltx) * ROT_SPEED;
    targetX -= (e.touches[0].clientY - lty) * ROT_SPEED;
    targetX = clamp(targetX, -Math.PI / 2, Math.PI / 2);
    ltx = e.touches[0].clientX; lty = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    const d = touchDist(e);
    targetFov = clamp(targetFov + (lpinch - d) * 0.15, 20, 105);
    lpinch = d;
  }
}, { passive: false });

// ── Keyboard ───────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  navigateTo(currentIndex - 1);
  if (e.key === 'ArrowRight') navigateTo(currentIndex + 1);
});

// ── Navigation ─────────────────────────────────────────────────────────────────
function navigateTo(i) {
  const filled = slots.filter(Boolean).length;
  if (filled < 2 || isLoading) return;
  i = ((i % filled) + filled) % filled;
  if (i === currentIndex) return;
  currentIndex = i;
  applyCurrentSlot();
}

function updateNav() {
  const filled = slots.filter(Boolean).length;
  document.getElementById('nav').classList.toggle('visible', filled >= 2);
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentIndex);
    dot.style.opacity = slots[i] ? '1' : '0.25';
  });
}

document.getElementById('prev-btn').addEventListener('click', () => navigateTo(currentIndex - 1));
document.getElementById('next-btn').addEventListener('click', () => navigateTo(currentIndex + 1));
document.querySelectorAll('.dot').forEach(dot =>
  dot.addEventListener('click', () => navigateTo(Number(dot.dataset.index)))
);

// ── File loading ───────────────────────────────────────────────────────────────
const fileInput = document.getElementById('file-input');
document.getElementById('load-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { handleFiles(Array.from(e.target.files)); fileInput.value = ''; });

function handleFiles(files) {
  const imgs = files.filter(f => f.type.startsWith('image/')).slice(0, 3);
  if (!imgs.length) return;
  const start = slots.findIndex(s => !s);
  const from  = start === -1 ? 0 : start;
  imgs.forEach((file, i) => {
    const idx = (from + i) % 3;
    if (slots[idx] && slots[idx].startsWith('blob:')) URL.revokeObjectURL(slots[idx]);
    slots[idx] = URL.createObjectURL(file);
  });
  currentIndex = from % 3;
  applyCurrentSlot();
}

// Drag-and-drop
const dropOverlay = document.getElementById('dropzone-overlay');
let dragCount = 0;
document.addEventListener('dragenter', e => { e.preventDefault(); dragCount++; dropOverlay.classList.add('active'); });
document.addEventListener('dragleave', () => { if (--dragCount <= 0) { dragCount = 0; dropOverlay.classList.remove('active'); } });
document.addEventListener('dragover',  e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); dragCount = 0; dropOverlay.classList.remove('active'); handleFiles(Array.from(e.dataTransfer.files)); });

// Auto-rotate toggle
const autoBtn = document.getElementById('autorotate-btn');
autoBtn.addEventListener('click', () => { autoRotate = !autoRotate; autoBtn.classList.toggle('active', autoRotate); });

// ── Loading overlay ────────────────────────────────────────────────────────────
function showLoading(on) {
  isLoading = on;
  document.getElementById('loading-overlay').classList.toggle('visible', on);
}

// ── Resize ─────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
});

// ── Startup ────────────────────────────────────────────────────────────────────
gl.enable(gl.DEPTH_TEST);
gl.viewport(0, 0, canvas.width, canvas.height);
DEFAULT_IMAGES.forEach((src, i) => { slots[i] = src; });
updateNav();
applyCurrentSlot();

// ── Render loop ────────────────────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);

  if (autoRotate && !dragging) targetY -= AUTO_SPEED;
  rotX += (targetX - rotX) * SMOOTH;
  rotY += (targetY - rotY) * SMOOTH;
  fov  += (targetFov - fov) * 0.08;

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (!activeTexture) return;

  const mvp = mat4Mul(perspective(fov, canvas.width / canvas.height, 0.1, 100), viewMatrix(rotY, rotX));
  gl.uniformMatrix4fv(uMVP, false, mvp);
  gl.uniform1i(uTex, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, activeTexture);

  gl.bindBuffer(gl.ARRAY_BUFFER, window._spherePosBuf);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, window._sphereUVBuf);
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, window._sphereIdxBuf);
  gl.drawElements(gl.TRIANGLES, window._sphereIdxCount, gl.UNSIGNED_SHORT, 0);
}

render();

// ── Helpers ────────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function touchDist(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }

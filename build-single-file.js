#!/usr/bin/env node
// Bundles index.html, style.css, viewer.js, Three.js, and the 3 panorama
// images into one fully self-contained HTML file. No internet or server needed.

const fs   = require('fs');
const path = require('path');

const root = __dirname;

const css    = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let   viewer = fs.readFileSync(path.join(root, 'viewer.js'), 'utf8');
// Use the UMD build — designed for plain <script> tags, sets window.THREE automatically.
// (three.module.min.js is an ES-module build and breaks when inlined as a plain script.)
let   three  = fs.readFileSync(path.join(root, 'vendor/three.umd.min.js'), 'utf8');

// ── Embed the 3 panorama images as base64 data URIs ───────────────────────────
const IMAGE_FILES = [
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE0440.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE1771.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE2846.png',
];

// Images are embedded as hidden <img> elements — the browser decodes them
// natively without any XHR/fetch, which is what makes this work on Android
// content:// and file:// origins. We reference them by CSS selector in JS.
const dataURIs = IMAGE_FILES.map(filename => {
  const buf = fs.readFileSync(path.join(root, filename));
  return `data:image/png;base64,${buf.toString('base64')}`;
});

// Point DEFAULT_IMAGES at the element IDs we'll create in the HTML
viewer = viewer.replace(
  /const DEFAULT_IMAGES = \[[\s\S]*?\];/,
  `const DEFAULT_IMAGES = ['#pano-0', '#pano-1', '#pano-2'];`
);

// ── Strip the import line from viewer.js ──────────────────────────────────────
viewer = viewer.replace(/^import \* as THREE from ['"]three['"];\n?/m, '');

// ── Assemble ──────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>3D Image Viewer</title>
  <style>
${css}
  </style>
</head>
<body>
  <div id="viewer-container"></div>

  <div id="ui">
    <div id="toolbar">
      <span id="logo">&#9679; 360&#xB0; Viewer</span>
      <div id="toolbar-actions">
        <button id="autorotate-btn" class="toolbar-btn active" title="Toggle auto-rotate">
          &#8635; Auto-rotate
        </button>
        <button id="load-btn" class="toolbar-btn">&#128247; Load Images</button>
        <input type="file" id="file-input" accept="image/*" multiple />
      </div>
    </div>
  </div>

  <div id="nav">
    <button id="prev-btn" class="nav-arrow" aria-label="Previous image">&#8592;</button>
    <div id="dots">
      <span class="dot" data-index="0"></span>
      <span class="dot" data-index="1"></span>
      <span class="dot" data-index="2"></span>
    </div>
    <button id="next-btn" class="nav-arrow" aria-label="Next image">&#8594;</button>
  </div>

  <div id="loading-overlay"><div id="spinner"></div></div>

  <div id="dropzone-overlay">
    <div id="dropzone-label">Drop up to 3 images here</div>
  </div>

  <!-- Pre-decoded panorama images. Using <img> src avoids XHR so this works
       on Android content:// and file:// origins. -->
  <img id="pano-0" src="${dataURIs[0]}" style="display:none" crossorigin="anonymous" />
  <img id="pano-1" src="${dataURIs[1]}" style="display:none" crossorigin="anonymous" />
  <img id="pano-2" src="${dataURIs[2]}" style="display:none" crossorigin="anonymous" />

  <div id="webgl-error" style="display:none;position:fixed;inset:0;background:#111;color:#fff;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;z-index:999">
    <div>
      <div style="font-size:48px;margin-bottom:16px">&#9888;</div>
      <div style="font-size:20px;font-weight:600;margin-bottom:8px">WebGL not available</div>
      <div style="font-size:14px;opacity:0.6">Try opening this file in Chrome or Firefox</div>
    </div>
  </div>

  <script>
/* ── Three.js r160 (minified, inlined) ────────────────────────────── */
${three}

/* ── 360° Viewer ──────────────────────────────────────────────────── */
${viewer}
  </script>
</body>
</html>
`;

const out = path.join(root, 'viewer-offline.html');
fs.writeFileSync(out, html, 'utf8');

const kb = (fs.statSync(out).size / 1024).toFixed(0);
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`Written: viewer-offline.html  (${kb} KB / ${mb} MB)`);
IMAGE_FILES.forEach((f, i) => {
  const kb = (dataURIs[i].length * 0.75 / 1024).toFixed(0);
  console.log(`  Image ${i + 1}: ${f}  (~${kb} KB)`);
});

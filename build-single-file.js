#!/usr/bin/env node
// Bundles everything into one self-contained HTML file.
// No Three.js — pure WebGL viewer, works on Android content:// / file:// origins.

const fs   = require('fs');
const path = require('path');
const root = __dirname;

const css    = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let   viewer = fs.readFileSync(path.join(root, 'viewer.js'), 'utf8');

// ── Embed images as <img> elements (not JS strings) ───────────────────────────
// Browser decodes <img src="data:..."> natively — no XHR, works on any origin.
const IMAGE_FILES = [
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE0440.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE1771.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE2846.png',
];

const dataURIs = IMAGE_FILES.map(f =>
  'data:image/png;base64,' + fs.readFileSync(path.join(root, f)).toString('base64')
);

// Replace DEFAULT_IMAGES paths with the #id references
viewer = viewer.replace(
  /const DEFAULT_IMAGES = \[[\s\S]*?\];/,
  `const DEFAULT_IMAGES = ['#pano-0', '#pano-1', '#pano-2'];`
);

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
        <button id="autorotate-btn" class="toolbar-btn active">&#8635; Auto-rotate</button>
        <button id="load-btn" class="toolbar-btn">&#128247; Load Images</button>
        <input type="file" id="file-input" accept="image/*" multiple />
      </div>
    </div>
  </div>

  <div id="nav">
    <button id="prev-btn" class="nav-arrow" aria-label="Previous">&#8592;</button>
    <div id="dots">
      <span class="dot" data-index="0"></span>
      <span class="dot" data-index="1"></span>
      <span class="dot" data-index="2"></span>
    </div>
    <button id="next-btn" class="nav-arrow" aria-label="Next">&#8594;</button>
  </div>

  <div id="loading-overlay"><div id="spinner"></div></div>

  <div id="dropzone-overlay">
    <div id="dropzone-label">Drop up to 3 images here</div>
  </div>

  <div id="webgl-error" style="display:none;position:fixed;inset:0;background:#111;color:#fff;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;z-index:999">
    <div style="font-size:48px;margin-bottom:16px">&#9888;</div>
    <div style="font-size:20px;font-weight:600;margin-bottom:8px">WebGL not available</div>
    <div style="font-size:14px;opacity:0.6">Try Chrome or Firefox</div>
  </div>

  <!-- Panorama images pre-decoded by the browser; referenced by #id in JS -->
  <img id="pano-0" src="${dataURIs[0]}" style="display:none" />
  <img id="pano-1" src="${dataURIs[1]}" style="display:none" />
  <img id="pano-2" src="${dataURIs[2]}" style="display:none" />

  <script>
${viewer}
  </script>
</body>
</html>
`;

const out = path.join(root, 'viewer-offline.html');
fs.writeFileSync(out, html, 'utf8');
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`Written: viewer-offline.html  (${mb} MB)`);
IMAGE_FILES.forEach((f, i) => {
  console.log(`  Image ${i + 1}: ${f}  (~${(dataURIs[i].length * 0.75 / 1024 / 1024).toFixed(1)} MB)`);
});

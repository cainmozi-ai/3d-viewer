#!/usr/bin/env node
// Bundles index.html, style.css, viewer.js, Three.js, and the 3 panorama
// images into one fully self-contained HTML file. No internet or server needed.

const fs   = require('fs');
const path = require('path');

const root = __dirname;

const css    = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let   viewer = fs.readFileSync(path.join(root, 'viewer.js'), 'utf8');
let   three  = fs.readFileSync(path.join(root, 'vendor/three.module.min.js'), 'utf8');

// ── Embed the 3 panorama images as base64 data URIs ───────────────────────────
const IMAGE_FILES = [
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE0440.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE1771.png',
  'VR RENDER EXPERIENCE SIGNAL LOST ARCHIVE2846.png',
];

const dataURIs = IMAGE_FILES.map(filename => {
  const buf = fs.readFileSync(path.join(root, filename));
  return `data:image/png;base64,${buf.toString('base64')}`;
});

// Replace the DEFAULT_IMAGES array in viewer.js with the embedded data URIs
viewer = viewer.replace(
  /const DEFAULT_IMAGES = \[[\s\S]*?\];/,
  `const DEFAULT_IMAGES = [\n  '${dataURIs.join("',\n  '")}'\n];`
);

// ── Convert Three.js ES-module export to a plain const ────────────────────────
// three.module.min.js ends with: export{Foo,Bar,...};
// We turn that into: const THREE={Foo,Bar,...};
three = three.replace(/export\{/, 'const THREE={');

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

  <script type="module">
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

#!/usr/bin/env node
// Bundles index.html, style.css, viewer.js, and Three.js into one HTML file.

const fs = require('fs');
const path = require('path');

const root = __dirname;

const css    = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'viewer.js'), 'utf8');
let   three  = fs.readFileSync(path.join(root, 'vendor/three.module.min.js'), 'utf8');

// Convert the ES-module export at the end into a plain const so everything
// can live in one <script type="module"> without needing an import map.
// three.module.min.js ends with: export{Foo,Bar,...};
three = three.replace(/export\{/, 'const THREE={');

// Remove the `import * as THREE from 'three';` line from viewer.js
const viewerInlined = viewer.replace(/^import \* as THREE from ['"]three['"];\n?/m, '');

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
        <button id="load-btn" class="toolbar-btn">&#128247; Load Image</button>
        <input type="file" id="file-input" accept="image/*" />
      </div>
    </div>
  </div>

  <div id="hint">Drag to look around &nbsp;&middot;&nbsp; Scroll to zoom</div>

  <div id="dropzone-overlay">
    <div id="dropzone-label">Drop your 360&#xB0; image here</div>
  </div>

  <script type="module">
/* ── Three.js r160 (minified, inlined) ────────────────────────────── */
${three}

/* ── 360° Viewer ──────────────────────────────────────────────────── */
${viewerInlined}
  </script>
</body>
</html>
`;

const out = path.join(root, 'viewer-offline.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`Written: ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);

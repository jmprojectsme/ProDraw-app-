// ── Canvas & Context ───────────────────────────────────
const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const toolbar = document.getElementById('toolbar');
const menuBtn = document.getElementById('menu-btn');
const hint    = document.getElementById('shape-hint');
const badge   = document.getElementById('active-tool-badge');

// ── App State ──────────────────────────────────────────
let drawing      = false;
let brushSize    = 5;
let brushOpacity = 1;
let brushColor   = '#e94560';
let texture      = 'normal';
let shape        = 'free';
let fillMode     = 'stroke';
let erasing      = false;
let history      = [];
let redoHistory  = [];
let startX, startY;
let snapshot     = null; // ImageData for live shape preview

// ── Canvas Sizing ──────────────────────────────────────
function resizeCanvas() {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.putImageData(imgData, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Menu Toggle ────────────────────────────────────────
menuBtn.addEventListener('click', () => toolbar.classList.toggle('open'));
canvas.addEventListener('click', () => toolbar.classList.remove('open'));

// ── History: Save / Restore ────────────────────────────
function saveState() {
  history.push(canvas.toDataURL());
  if (history.length > 60) history.shift();
  redoHistory = [];
}

function restoreState(dataURL) {
  return new Promise(resolve => {
    const img  = new Image();
    img.src    = dataURL;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve();
    };
  });
}

// ── Position Helper ────────────────────────────────────
// On touchend, touches[] is empty — must use changedTouches[]
function getPos(e, forceChanged = false) {
  const rect = canvas.getBoundingClientRect();
  const src  = (e.changedTouches && (forceChanged || e.touches.length === 0))
               ? e.changedTouches[0]
               : (e.touches ? e.touches[0] : e);
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top
  };
}

// ── Apply Drawing Styles ───────────────────────────────
function applyStyle(softOverride = false) {
  const isDark    = document.body.classList.contains('dark');
  ctx.lineWidth   = brushSize;
  ctx.globalAlpha = brushOpacity;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.strokeStyle = erasing ? (isDark ? '#111111' : '#ffffff') : brushColor;
  ctx.fillStyle   = erasing ? ctx.strokeStyle : brushColor;
  ctx.setLineDash([]);
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';

  if (!erasing) {
    if (texture === 'dotted') {
      ctx.setLineDash([brushSize * 1.5, brushSize]);
    }
    if (texture === 'soft' || softOverride) {
      ctx.shadowBlur  = brushSize * 1.5;
      ctx.shadowColor = brushColor;
    }
  }
}

// ── Chalk Texture ──────────────────────────────────────
function chalkDab(x, y) {
  const isDark = document.body.classList.contains('dark');
  const spread = brushSize * 0.8;
  ctx.globalAlpha = brushOpacity * 0.25;
  for (let i = 0; i < 12; i++) {
    const ox = (Math.random() - 0.5) * spread;
    const oy = (Math.random() - 0.5) * spread;
    const r  = Math.random() * (brushSize * 0.3) + 1;
    ctx.beginPath();
    ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
    ctx.fillStyle = erasing ? (isDark ? '#111' : '#fff') : brushColor;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Draw Shape ─────────────────────────────────────────
function drawShape(x1, y1, x2, y2) {
  ctx.beginPath();

  switch (shape) {
    case 'line':
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;

    case 'rect': {
      const w = x2 - x1;
      const h = y2 - y1;
      if (fillMode === 'fill' || fillMode === 'both') ctx.fillRect(x1, y1, w, h);
      if (fillMode === 'stroke' || fillMode === 'both') ctx.strokeRect(x1, y1, w, h);
      break;
    }

    case 'ellipse': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fillMode === 'fill' || fillMode === 'both') ctx.fill();
      if (fillMode === 'stroke' || fillMode === 'both') ctx.stroke();
      break;
    }

    case 'triangle': {
      const mx = (x1 + x2) / 2;
      ctx.moveTo(mx, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x1, y2);
      ctx.closePath();
      if (fillMode === 'fill' || fillMode === 'both') ctx.fill();
      if (fillMode === 'stroke' || fillMode === 'both') ctx.stroke();
      break;
    }

    case 'arrow': {
      const dx    = x2 - x1;
      const dy    = y2 - y1;
      const angle = Math.atan2(dy, dx);
      const hw    = Math.min(brushSize * 4, 30);
      // Shaft
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hw * Math.cos(angle - Math.PI / 6), y2 - hw * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - hw * Math.cos(angle + Math.PI / 6), y2 - hw * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

// ── Shape Hint Banner ──────────────────────────────────
const shapeHints = {
  line:     'Drag to draw a line',
  rect:     'Drag to draw a rectangle',
  ellipse:  'Drag to draw an ellipse',
  triangle: 'Drag to draw a triangle',
  arrow:    'Drag to draw an arrow'
};

function showHint() {
  hint.textContent = shapeHints[shape] || '';
  hint.classList.add('show');
}

function hideHint() {
  hint.classList.remove('show');
}

// ── Drawing Events ─────────────────────────────────────
canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove',  onDraw,       { passive: false });
canvas.addEventListener('touchend',   stopDrawing,  { passive: false });
canvas.addEventListener('mousedown',  startDrawing);
canvas.addEventListener('mousemove',  onDraw);
canvas.addEventListener('mouseup',    stopDrawing);

function startDrawing(e) {
  e.preventDefault();
  drawing = true;
  const pos = getPos(e);
  startX = pos.x;
  startY = pos.y;

  if (shape === 'free') {
    saveState();
    applyStyle();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  } else {
    // Snapshot for live preview
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    showHint();
  }
}

function onDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  const pos = getPos(e);

  if (shape === 'free') {
    applyStyle();

    if (texture === 'chalk') {
      chalkDab(pos.x, pos.y);
    } else if (texture === 'soft') {
      applyStyle(true);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    } else {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  } else {
    // Restore snapshot then draw live preview
    ctx.putImageData(snapshot, 0, 0);
    applyStyle();
    drawShape(startX, startY, pos.x, pos.y);
  }
}

function stopDrawing(e) {
  if (!drawing) return;
  drawing = false;
  const pos = getPos(e, true); // changedTouches for touch release

  if (shape !== 'free') {
    saveState();
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
    applyStyle();
    drawShape(startX, startY, pos.x, pos.y);
    snapshot = null;
    hideHint();
  } else {
    ctx.closePath();
  }
}

// ── Controls ───────────────────────────────────────────
document.getElementById('brushSize').oninput = e => {
  brushSize = +e.target.value;
  document.getElementById('sizeVal').textContent = brushSize;
};

document.getElementById('brushOpacity').oninput = e => {
  brushOpacity = +e.target.value;
  document.getElementById('opacityVal').textContent = Math.round(brushOpacity * 100) + '%';
};

document.getElementById('colorPicker').oninput = e => {
  brushColor = e.target.value;
  if (erasing) setEraserOff();
};

document.getElementById('texture').onchange  = e => texture  = e.target.value;
document.getElementById('fillMode').onchange = e => fillMode = e.target.value;

document.getElementById('shape').onchange = e => {
  shape = e.target.value;
  const icons = { free:'✏️', line:'╱', rect:'▭', ellipse:'⬭', triangle:'△', arrow:'➜' };
  const names = { free:'Free Draw', line:'Line', rect:'Rectangle', ellipse:'Ellipse', triangle:'Triangle', arrow:'Arrow' };
  badge.textContent = (icons[shape] || '✏️') + ' ' + (names[shape] || shape);
};

// ── Eraser ─────────────────────────────────────────────
function setEraserOn()  {
  erasing = true;
  document.getElementById('eraserBtn').classList.add('active');
  badge.textContent = '🧹 Eraser';
}

function setEraserOff() {
  erasing = false;
  document.getElementById('eraserBtn').classList.remove('active');
}

document.getElementById('eraserBtn').onclick = () => erasing ? setEraserOff() : setEraserOn();

// ── Undo / Redo ────────────────────────────────────────
document.getElementById('undoBtn').onclick = async () => {
  if (!history.length) return;
  redoHistory.push(canvas.toDataURL());
  await restoreState(history.pop());
};

document.getElementById('redoBtn').onclick = async () => {
  if (!redoHistory.length) return;
  history.push(canvas.toDataURL());
  await restoreState(redoHistory.pop());
};

// ── Clear ──────────────────────────────────────────────
document.getElementById('clearBtn').onclick = () => {
  saveState();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};

// ── Save / Export ──────────────────────────────────────
document.getElementById('saveBtn').onclick = () => {
  const link      = document.createElement('a');
  link.download   = 'prodraw-' + Date.now() + '.png';
  link.href       = canvas.toDataURL('image/png');
  link.click();
};

// ── Dark / Light Mode ──────────────────────────────────
document.getElementById('toggleMode').onclick = () => {
  document.body.classList.toggle('dark');
};

// ── Keyboard Shortcuts ─────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); document.getElementById('undoBtn').click(); }
    if (e.key === 'y') { e.preventDefault(); document.getElementById('redoBtn').click(); }
    if (e.key === 's') { e.preventDefault(); document.getElementById('saveBtn').click(); }
  }
  if (e.key === 'e') setEraserOn();
  if (e.key === 'Escape') setEraserOff();
});

// ── Service Worker Registration ────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW failed:', err));
  });
}

// ── PWA Install Prompt ─────────────────────────────────
let deferredPrompt;
const installBanner  = document.getElementById('install-banner');
const installBtn     = document.getElementById('install-btn');
const installDismiss = document.getElementById('install-dismiss');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installBanner.classList.add('show');
});

installBtn.addEventListener('click', async () => {
  installBanner.classList.remove('show');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Install outcome:', outcome);
    deferredPrompt = null;
  }
});

installDismiss.addEventListener('click', () => {
  installBanner.classList.remove('show');
});

window.addEventListener('appinstalled', () => {
  console.log('ProDraw installed!');
  installBanner.classList.remove('show');
});
        

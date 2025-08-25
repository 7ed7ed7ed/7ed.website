import { loadMenu } from './menuloader.js';

const video  = document.getElementById('introVideo');
const menu   = document.getElementById('menu');
const stage  = document.getElementById('stage');
const poster = document.getElementById('referencePoster');

// Build menu (kept hidden until reveal)
loadMenu({ container: menu, dataUrl: './data/menuItems.json?v=' + Date.now() });

// First click = start video (sound ON); second click = skip
let hasStarted = false;

stage.addEventListener('click', async () => {
  if (menu.classList.contains('show')) return;

  if (!hasStarted) {
    try {
      video.muted = false;
      video.volume = 0.9;
      await video.play();         // user gesture => should start with sound
      hasStarted = true;
      return;                     // don't skip on first click
    } catch (e) {
      console.warn('[intro] click failed to start video:', e?.name || e);
      return;
    }
  }
  revealMenu();
});

// Skip when video ends naturally
video.addEventListener('ended', revealMenu);

// Keyboard helpers
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'm') video.muted = !video.muted;
  if (k === ' ') { e.preventDefault(); if (video.paused) video.play(); else video.pause(); }
  if (k === 's') revealMenu();
  if (k === 'd') toggleDev();
});

function toggleDev(){
  document.body.classList.toggle('dev');
  menu.classList.toggle('dev', document.body.classList.contains('dev'));
  if (document.body.classList.contains('dev')) syncMenuToCanvasBox();
}

// Show poster only after intro (prevents gray edges)
function revealMenu() {
  if (!menu) return;
  menu.classList.add('show');
  poster.classList.add('is-visible');  // <-- show now
  syncMenuToCanvasBox();

  try { video.pause(); } catch {}
  video.classList.add('fadeOut');

  setTimeout(() => {
    video.style.display = 'none';
    syncMenuToCanvasBox();
  }, 650);

  requestAnimationFrame(syncMenuToCanvasBox);
}

// Keep .menu aligned to the visible media rect (video or poster)
function syncMenuToCanvasBox() {
  const canvasEl = (video.style.display !== 'none') ? video : poster;
  const r = canvasEl.getBoundingClientRect();
  menu.style.left   = r.left + 'px';
  menu.style.top    = r.top + 'px';
  menu.style.width  = r.width + 'px';
  menu.style.height = r.height + 'px';
  menu.style.pointerEvents = menu.classList.contains('show') ? 'auto' : 'none';
}

// Fallback in case "ended" never fires
function armFallback() {
  const dur = isFinite(video.duration) ? video.duration : 120; // seconds
  setTimeout(() => { if (!menu.classList.contains('show')) revealMenu(); }, (dur * 1000) + 500);
}

video.addEventListener('loadedmetadata', () => {
  syncMenuToCanvasBox();
  armFallback();
});
video.addEventListener('loadeddata',     syncMenuToCanvasBox);
window.addEventListener('load',          syncMenuToCanvasBox);
window.addEventListener('resize',        () => setTimeout(syncMenuToCanvasBox, 50));
window.addEventListener('orientationchange', () => setTimeout(syncMenuToCanvasBox, 150));
window.addEventListener('fullscreenchange',  syncMenuToCanvasBox);
requestAnimationFrame(syncMenuToCanvasBox);

// ===== Dev Align v2: click to select; arrows nudge; +/-,[,] or wheel resize =====
(function devAlign(){
  const tip = document.createElement('div');
  tip.className = 'dev-tip'; tip.style.display = 'none';
  document.body.appendChild(tip);

  let dragging = null;
  let selected = null;
  let shiftDown = false, altDown = false;

  // --- helpers ---
  const isDev = () => document.body.classList.contains('dev');
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

  function stepSize() {
    if (altDown)   return 2.0;   // coarse
    if (shiftDown) return 0.2;   // fine
    return 0.6;                  // normal (all in percentage points)
  }

  function canvasRect() { return menu.getBoundingClientRect(); }
  function canvasW()    { return Math.max(1, canvasRect().width); }

  function getSizeTarget(el) {
    const svg = el.querySelector('svg');
    return svg || el; // SVG width vs. text font-size
  }

  function getSizePct(el) {
    const target = getSizeTarget(el);
    const w = target.getBoundingClientRect().width || 0.0001;
    return (w / canvasW()) * 100;
  }

  function setSizePct(el, pct) {
    const target = getSizeTarget(el);
    const p = clamp(pct, 2, 40); // keep sane: 2%..40% of canvas width
    if (target.tagName.toLowerCase() === 'svg') {
      target.style.width = p.toFixed(2) + 'vw';
    } else {
      el.style.fontSize = p.toFixed(2) + 'vw';
    }
    return p;
  }

  function setXYPct(el, x, y) {
    el.style.left = clamp(x, 0, 100) + '%';
    el.style.top  = clamp(y, 0, 100) + '%';
  }

  function showTip(el, clientX, clientY) {
    const r = canvasRect();
    const x = parseFloat(el.style.left||'0');
    const y = parseFloat(el.style.top ||'0');
    const pct = getSizePct(el);
    tip.style.left = (clientX ?? (r.left + r.width/2)) + 'px';
    tip.style.top  = (clientY ?? r.top) + 'px';
    tip.textContent = `${x.toFixed(2)}%, ${y.toFixed(2)}% | size ${pct.toFixed(2)}%`;
    tip.style.display = 'block';
  }

  function select(el) {
    if (selected) selected.classList.remove('dev-selected');
    selected = el || null;
    if (selected) selected.classList.add('dev-selected');
    if (!selected) tip.style.display = 'none';
  }

  function logSnippet(el, silent=false){
    const x = parseFloat(el.style.left).toFixed(2);
    const y = parseFloat(el.style.top ).toFixed(2);
    const isSvg = !!el.querySelector('svg');
    const pct = getSizePct(el).toFixed(2);

    const json = isSvg
      ? `{ "svg": "PATH/TO/SVG.svg", "x": ${x}, "y": ${y}, "iconSize": "${pct}%" }`
      : `{ "label": "${el.textContent || '(label)'}", "x": ${x}, "y": ${y}, "size": "clamp(18px, ${pct}%, 96px)" }`;
    if (!silent) console.log(json);
  }

  // --- pointer selection + dragging ---
  menu.addEventListener('pointerdown', (e) => {
    if (!isDev()) return;
    const el = e.target.closest('a.menu-item'); if (!el) return;
    e.preventDefault();
    select(el);
    dragging = { el, startX: e.clientX, startY: e.clientY };
    menu.setPointerCapture(e.pointerId);
    showTip(el, e.clientX, e.clientY);
  });

  menu.addEventListener('pointermove', (e) => {
    if (!isDev() || !dragging) return;
    const r = canvasRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top ) / r.height)* 100;
    setXYPct(dragging.el, px, py);
    showTip(dragging.el, e.clientX, e.clientY);
  });

  menu.addEventListener('pointerup', () => {
    if (!isDev() || !dragging) return;
    logSnippet(dragging.el);
    dragging = null;
  });

  // --- wheel resize (tamed) ---
  menu.addEventListener('wheel', (e) => {
    if (!isDev() || !selected) return;
    e.preventDefault();
    const steps = Math.max(-3, Math.min(3, Math.round(-e.deltaY / 100)));
    if (steps) {
      const newPct = setSizePct(selected, getSizePct(selected) + steps * stepSize());
      showTip(selected);
      logSnippet(selected, true);
    }
  }, { passive:false });

  // --- keyboard: select, move, resize ---
  window.addEventListener('keydown', (e) => {
    // dev toggle is elsewhere; here we only act WHEN dev is on
    if (e.key === 'Shift') shiftDown = true;
    if (e.key === 'Alt')   altDown   = true;

    if (!isDev() || !selected) return;

    const key = e.key;

    // resize: +, =, ], [, also . and , as alternates
    if (['+', '=', ']', '.', '>'].includes(key)) { e.preventDefault(); bumpSize(+1); }
    if (['-', '_', '[', ',', '<'].includes(key)) { e.preventDefault(); bumpSize(-1); }

    // arrows nudge position
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) {
      e.preventDefault();
      const step = stepSize(); // % points
      const x = parseFloat(selected.style.left||'50');
      const y = parseFloat(selected.style.top ||'50');
      if (key === 'ArrowLeft')  setXYPct(selected, x - step, y);
      if (key === 'ArrowRight') setXYPct(selected, x + step, y);
      if (key === 'ArrowUp')    setXYPct(selected, x, y - step);
      if (key === 'ArrowDown')  setXYPct(selected, x, y + step);
      showTip(selected);
      logSnippet(selected, true);
    }

    // Esc to clear selection
    if (key === 'Escape') { select(null); }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftDown = false;
    if (e.key === 'Alt')   altDown   = false;
  });

  function bumpSize(dir){
    const newPct = setSizePct(selected, getSizePct(selected) + dir * stepSize());
    showTip(selected);
    logSnippet(selected, true);
  }

  // Also allow Tab to cycle through items in dev mode
  window.addEventListener('keydown', (e) => {
    if (!isDev()) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('.menu-item')];
      if (!items.length) return;
      let i = items.indexOf(selected);
      i = (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      select(items[i]);
      showTip(selected);
    }
  });
})();

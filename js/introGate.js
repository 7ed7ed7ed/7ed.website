import { loadMenu } from './menuLoader.js';

const body  = document.body;
const stage = document.getElementById('stage');
const loopGif = document.getElementById('loopGif');
const video = document.getElementById('introVideo');
const menu  = document.getElementById('menu');

/* ===== pin menu to media rect (fallback to stage if video hidden) ===== */
const MENU_DESIGN_WIDTH = 2560;
const MENU_DESIGN_HEIGHT = 1600;

function rectOfTarget() {
  if (video) {
    const r = video.getBoundingClientRect();
    // if hidden or zero-sized, fall back to stage
    if ((r.width > 0 && r.height > 0) && !video.classList.contains('is-hidden')) return r;
  }
  return (stage ? stage.getBoundingClientRect() : { left:0, top:0, width:window.innerWidth, height:window.innerHeight });
}

function fitRectToDesign(rect) {
  const scale = Math.min(
    rect.width / MENU_DESIGN_WIDTH,
    rect.height / MENU_DESIGN_HEIGHT
  );
  const width = MENU_DESIGN_WIDTH * scale;
  const height = MENU_DESIGN_HEIGHT * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return { left, top, width, height, scale };
}

function syncMenuToCanvasBox() {
  if (!menu) return;
  const r = rectOfTarget();
  const { left, top, scale } = fitRectToDesign(r);
  const interactive = menu.classList.contains('show') || menu.classList.contains('dev');
  menu.dataset.scale = String(scale);
  Object.assign(menu.style, {
    left:  left + 'px',
    top:   top + 'px',
    width: MENU_DESIGN_WIDTH + 'px',
    height: MENU_DESIGN_HEIGHT + 'px',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    pointerEvents: interactive ? 'auto' : 'none'
  });
}

['loadedmetadata','loadeddata','load'].forEach(ev => window.addEventListener(ev, syncMenuToCanvasBox));
window.addEventListener('resize',            () => setTimeout(syncMenuToCanvasBox, 50));
window.addEventListener('orientationchange', () => setTimeout(syncMenuToCanvasBox, 150));
window.addEventListener('fullscreenchange',  syncMenuToCanvasBox);
requestAnimationFrame(syncMenuToCanvasBox);

const MODAL_PAGE_MAP = {
  '/bio.html': {
    css: ['css/bio.css'],
    // Wider bio window for comfortable layout
    window: { width: 146, height: 449, left: 33, top: 409, resizable: true }
  },
  '/info.html': {
    css: ['css/info.css'],
    scripts: ['js/info-hotspot.js'],
    // Open the info page nearly full size for readability
    window: { width: 1440, height: 809, left: 0, top: 25, resizable: true },
    init(root) {
      if (typeof window.initInfoHotspot === 'function') window.initInfoHotspot(root);
    }
  },
  '/moodboard.html': {
    css: ['css/moodboard.css'],
    scripts: ['js/moodboard.js'],
    window: { width: 260, height: 809, left: 395, top: 25, resizable: true },
    init(root) {
      if (typeof window.initMoodboard === 'function') window.initMoodboard(root);
    }
  },
  '/gallery.html': {
    css: ['css/moodboard.css'],
    scripts: ['js/gallery.js'],
    window: { width: 183, height: 809, left: 213, top: 25, resizable: true },
    init(root) {
      if (typeof window.initGallery === 'function') window.initGallery(root);
    }
  },
  '/playlist.html': {
    window: { width: 217, height: 569, left: 977, top: 265, resizable: false }
  }
  ,
  '/bomb.html': {
    window: { width: 296, height: 233, left: 924, top: 542, resizable: true }
  },
  '/cassette.html': {
    css: ['css/moodboard.css'],
    scripts: ['js/cassette.js'],
    window: { width: 280, height: 253, left: 1160, top: 25, resizable: true },
    init(root) {
      if (typeof window.initCassette === 'function') window.initCassette(root);
    }
  }
  ,
  '/projects.html': {
    // Large window for PDF viewing
    window: { width: 566, height: 494, left: 167, top: 25, resizable: true }
  }
};

let hasStarted = false;   // first click starts with audio
let isRevealing = false;  // guard
let revealTriggeredByClick = false; // whether reveal came from a user gesture
let preOpened = [];       // pre-opened native popups [{ win, path }]
let preOpenedDone = false;

// remember if we’ve already shown the intro before (per tab)
try {
  localStorage.removeItem('introSeenAt');
  localStorage.removeItem('introSeen');
} catch {}

const INTRO_KEY = 'introSeen';
let store = null;
try { store = window.sessionStorage; } catch { store = null; }
const alreadySeen = store?.getItem(INTRO_KEY) === '1';

// Build the menu (hidden at first)
await loadMenu({ container: menu, dataUrl: './data/menuItems.json?v=' + Date.now() });
setupMenuLayoutTools();
setupDesktopWindows();

// If the intro was already seen, skip video immediately
if (alreadySeen) {
  body.classList.remove('intro-dark');
  body.classList.add('intro-light');
  menu.classList.add('show');
  if (video) video.classList.add('is-hidden'); // make sure video never blocks clicks
  if (loopGif) loopGif.classList.add('is-visible');
  syncMenuToCanvasBox();

  markIntroSeen();
  // Open the single window (info)
  try { window.__OPEN_SINGLE_INFO__?.(); } catch {}
} else {
  // fresh visit: start dark letterbox until reveal
  body.classList.add('intro-dark');

  if (stage && video) {
    // first click starts video with sound, second click reveals
    stage.addEventListener('click', async () => {
      if (menu.classList.contains('show') || isRevealing) return;

      if (!hasStarted) {
        try {
          // Popups are pre-opened on pointerdown; do not open more here
          video.muted = false;
          video.volume = 0.25;
          await video.play();
          hasStarted = true;
        } catch (err) {
          console.warn('[intro] play failed:', err?.name || err);
        }
        return; // don’t skip on first click
      }

      // second click -> reveal
      revealTriggeredByClick = true;
      endIntroFlow();
    });

    // auto reveal at natural end
    video.addEventListener('ended', endIntroFlow);
  }
}

// keyboard helpers
window.addEventListener('keydown', (e) => {
  if (!video) return;
  const k = e.key.toLowerCase();
  if (k === 'm') video.muted = !video.muted;
  if (k === ' ') { e.preventDefault(); if (video.paused) video.play(); else video.pause(); }
  if (k === 's') endIntroFlow(); // skip
});

/* ===== reveal (NO FADE—just pop) ===== */
function endIntroFlow() {
  if (isRevealing) return;
  isRevealing = true;

  menu.classList.add('show');
  body.classList.remove('intro-dark');
  body.classList.add('intro-light');

  if (video) {
    try { video.pause(); } catch {}
    video.classList.add('is-hidden');
    video.style.pointerEvents = 'none';
  }
  if (loopGif) loopGif.classList.add('is-visible');

  syncMenuToCanvasBox();
  markIntroSeen();
}

function markIntroSeen() {
  persistIntroSeen();
  window.__INTRO_DONE__ = true;
  document.dispatchEvent(new Event('intro:done'));
}

function persistIntroSeen() {
  try { store?.setItem(INTRO_KEY, '1'); } catch {}
}

/* ===== menu layout helper (drag to reposition in dev mode) ===== */
function setupMenuLayoutTools() {
  if (!menu) return;

  let layoutMode = false;
  let drag = null;
  let scalePanel = null;
  let selectedItem = null;

  const snap = (n) => Math.min(100, Math.max(0, n));
  const labelFor = (el, idx) => el.getAttribute('aria-label') || el.textContent?.trim() || `item-${idx}`;

  const readMenuScale = () => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--menu-scale');
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 1;
  };

  const setMenuScale = (value) => {
    const next = Number.isFinite(value) ? value : 1;
    document.documentElement.style.setProperty('--menu-scale', String(next));
  };

  const readItemScale = (item) => {
    if (!item) return 1;
    const raw = getComputedStyle(item).getPropertyValue('--item-scale');
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 1;
  };

  const setItemScale = (item, value) => {
    if (!item) return;
    const next = Number.isFinite(value) ? value : 1;
    item.style.setProperty('--item-scale', String(next));
  };

  const readItemPosition = (item) => {
    if (!item) return { x: 0, y: 0 };
    const x = parseFloat(item.style.left) || 0;
    const y = parseFloat(item.style.top) || 0;
    return { x, y };
  };

  const setItemPosition = (item, x, y) => {
    if (!item) return;
    const nextX = snap(x);
    const nextY = snap(y);
    item.style.left = nextX + '%';
    item.style.top = nextY + '%';
    item.dataset.x = nextX.toFixed(2);
    item.dataset.y = nextY.toFixed(2);
  };

  const lockSliderToPointer = (range) => {
    const keys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
    range.addEventListener('keydown', (e) => {
      if (keys.has(e.key)) e.preventDefault();
    });
    range.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  };

  const ensureScalePanel = () => {
    if (scalePanel) return scalePanel;
    const panel = document.createElement('div');
    panel.id = 'menu-scale-panel';
    panel.innerHTML = `
      <div class="menu-scale__header" data-drag-handle>Menu tools</div>
      <div class="menu-scale__group">
        <label class="menu-scale__label" for="menu-scale-range">Menu scale</label>
        <input id="menu-scale-range" class="menu-scale__range" type="range" min="0.5" max="1.5" step="0.01" />
        <input id="menu-scale-value" class="menu-scale__value" type="number" min="0.5" max="1.5" step="0.01" />
      </div>
      <div class="menu-scale__divider" aria-hidden="true"></div>
      <div class="menu-scale__group">
        <div class="menu-scale__meta">
          <span class="menu-scale__label">Selected item</span>
          <span id="menu-item-name" class="menu-scale__name">None</span>
        </div>
        <label class="menu-scale__label" for="item-scale-range">Item scale</label>
        <input id="item-scale-range" class="menu-scale__range" type="range" min="0.2" max="2.5" step="0.01" />
        <input id="item-scale-value" class="menu-scale__value" type="number" min="0.2" max="2.5" step="0.01" />
        <input id="item-scale-output" class="menu-scale__output" type="text" readonly />
        <label class="menu-scale__label" for="item-pos-step">Position step (%)</label>
        <input id="item-pos-step" class="menu-scale__value" type="number" min="0.01" max="5" step="0.01" value="0.1" />
        <div class="menu-scale__pos-grid">
          <button type="button" class="menu-scale__btn" data-nudge="up" aria-label="Move up">↑</button>
          <div class="menu-scale__pos-row">
            <button type="button" class="menu-scale__btn" data-nudge="left" aria-label="Move left">←</button>
            <button type="button" class="menu-scale__btn" data-nudge="right" aria-label="Move right">→</button>
          </div>
          <button type="button" class="menu-scale__btn" data-nudge="down" aria-label="Move down">↓</button>
        </div>
        <div class="menu-scale__pos-values">
          <div>
            <label class="menu-scale__label" for="item-pos-x">X (%)</label>
            <input id="item-pos-x" class="menu-scale__output" type="text" readonly />
          </div>
          <div>
            <label class="menu-scale__label" for="item-pos-y">Y (%)</label>
            <input id="item-pos-y" class="menu-scale__output" type="text" readonly />
          </div>
        </div>
        <button type="button" id="menu-copy-json" class="menu-scale__btn menu-scale__btn--wide">
          Copy JSON for selected
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    const range = panel.querySelector('#menu-scale-range');
    const valueInput = panel.querySelector('#menu-scale-value');
    const itemRange = panel.querySelector('#item-scale-range');
    const itemValueInput = panel.querySelector('#item-scale-value');
    const itemOutput = panel.querySelector('#item-scale-output');
    const itemName = panel.querySelector('#menu-item-name');
    const posStep = panel.querySelector('#item-pos-step');
    const posX = panel.querySelector('#item-pos-x');
    const posY = panel.querySelector('#item-pos-y');
    const copyButton = panel.querySelector('#menu-copy-json');
    const dragHandle = panel.querySelector('[data-drag-handle]');
    const sync = (value) => {
      range.value = value;
      valueInput.value = value;
    };

    const initial = readMenuScale().toFixed(2);
    sync(initial);
    lockSliderToPointer(range);

    const restorePanelPosition = () => {
      try {
        const raw = localStorage.getItem('menuPanelPos:v1');
        if (!raw) return;
        const pos = JSON.parse(raw);
        if (typeof pos?.left === 'number' && typeof pos?.top === 'number') {
          panel.style.left = pos.left + 'px';
          panel.style.top = pos.top + 'px';
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        }
      } catch {}
    };

    restorePanelPosition();

    const enablePanelDrag = () => {
      if (!dragHandle) return;
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;

      dragHandle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        panel.setPointerCapture?.(e.pointerId);
      });

      const onMove = (e) => {
        if (!isDragging) return;
        const nextLeft = startLeft + (e.clientX - startX);
        const nextTop = startTop + (e.clientY - startY);
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };

      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        try {
          const rect = panel.getBoundingClientRect();
          localStorage.setItem('menuPanelPos:v1', JSON.stringify({ left: rect.left, top: rect.top }));
        } catch {}
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    enablePanelDrag();

    range.addEventListener('input', () => {
      const next = parseFloat(range.value);
      setMenuScale(next);
      valueInput.value = range.value;
    });

    valueInput.addEventListener('input', () => {
      const next = parseFloat(valueInput.value);
      if (!Number.isFinite(next)) return;
      setMenuScale(next);
      range.value = valueInput.value;
    });

    const syncItem = (value) => {
      itemRange.value = value;
      itemValueInput.value = value;
      itemOutput.value = value;
    };

    const updatePositionOutputs = (item) => {
      const { x, y } = readItemPosition(item);
      posX.value = x.toFixed(2);
      posY.value = y.toFixed(2);
    };

    const setItemControls = (item) => {
      const label = item ? labelFor(item, 0) : 'None';
      itemName.textContent = label;
      const value = readItemScale(item).toFixed(2);
      syncItem(value);
      updatePositionOutputs(item);
      const disabled = !item;
      itemRange.disabled = disabled;
      itemValueInput.disabled = disabled;
      posStep.disabled = disabled;
      copyButton.disabled = disabled;
      panel.querySelectorAll('[data-nudge]').forEach((button) => {
        button.disabled = disabled;
      });
    };

    itemRange.addEventListener('input', () => {
      if (!selectedItem) return;
      const next = parseFloat(itemRange.value);
      setItemScale(selectedItem, next);
      itemValueInput.value = itemRange.value;
      itemOutput.value = itemRange.value;
      console.info(`[menu layout] ${labelFor(selectedItem, 0)} scale:${itemRange.value}`);
    });

    itemValueInput.addEventListener('input', () => {
      if (!selectedItem) return;
      const next = parseFloat(itemValueInput.value);
      if (!Number.isFinite(next)) return;
      setItemScale(selectedItem, next);
      itemRange.value = itemValueInput.value;
      itemOutput.value = itemValueInput.value;
      console.info(`[menu layout] ${labelFor(selectedItem, 0)} scale:${itemValueInput.value}`);
    });

    lockSliderToPointer(itemRange);

    panel.querySelectorAll('[data-nudge]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!selectedItem) return;
        const step = parseFloat(posStep.value) || 0.5;
        const { x, y } = readItemPosition(selectedItem);
        const dir = button.dataset.nudge;
        const nextX = dir === 'left' ? x - step : dir === 'right' ? x + step : x;
        const nextY = dir === 'up' ? y - step : dir === 'down' ? y + step : y;
        setItemPosition(selectedItem, nextX, nextY);
        updatePositionOutputs(selectedItem);
        console.info(`[menu layout] ${labelFor(selectedItem, 0)} -> x:${nextX.toFixed(2)}, y:${nextY.toFixed(2)}`);
      });
    });

    copyButton.addEventListener('click', async () => {
      if (!selectedItem) return;
      const label = labelFor(selectedItem, 0);
      const href = selectedItem.getAttribute('href') || '';
      const scale = readItemScale(selectedItem).toFixed(2);
      const { x, y } = readItemPosition(selectedItem);
      const payload = { href, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), scale: Number(scale), label };
      const text = JSON.stringify(payload);
      try {
        await navigator.clipboard.writeText(text);
        console.info('[menu layout] copied JSON for', label);
      } catch {
        console.info('[menu layout] copy failed; JSON:', text);
        alert(text);
      }
    });


    panel.__setItemControls = setItemControls;
    panel.__updatePositionOutputs = updatePositionOutputs;
    scalePanel = panel;
    return panel;
  };

  const setSelectedItem = (item) => {
    if (selectedItem === item) return;
    if (selectedItem) selectedItem.classList.remove('dev-selected');
    selectedItem = item;
    if (selectedItem) selectedItem.classList.add('dev-selected');
    scalePanel?.__setItemControls?.(selectedItem);
  };

  const toggleLayout = (on) => {
    layoutMode = on ?? !layoutMode;
    body?.classList.toggle('dev', layoutMode);
    menu.classList.toggle('dev', layoutMode);
    if (layoutMode) menu.classList.add('show');
    const panel = ensureScalePanel();
    panel.hidden = !layoutMode;
    if (!layoutMode) setSelectedItem(null);
    syncMenuToCanvasBox();
    console.info(`[menu layout] ${layoutMode ? 'ON' : 'OFF'} — drag items, press D to toggle. Call window.printMenuPositions() to log all.`);
  };

  const onDown = (e) => {
    if (!layoutMode) return;
    const item = e.target.closest('.menu-item');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedItem(item);
    const rect = menu.getBoundingClientRect();
    drag = {
      item,
      pointerId: e.pointerId,
      rect,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: parseFloat(item.style.left) || 50,
      startTop: parseFloat(item.style.top) || 50
    };
    console.info('[menu layout] drag start', {
      x: drag.startLeft,
      y: drag.startTop,
      rectW: drag.rect.width,
      rectH: drag.rect.height
    });
    item.setPointerCapture?.(e.pointerId);
    item.addEventListener('pointermove', onMove);
    item.addEventListener('pointerup', onUp);
    item.addEventListener('pointercancel', onUp);
  };

  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const xPct = snap(drag.startLeft + (dx / drag.rect.width) * 100);
    const yPct = snap(drag.startTop + (dy / drag.rect.height) * 100);
    drag.item.style.left = xPct + '%';
    drag.item.style.top = yPct + '%';
    drag.item.dataset.x = xPct.toFixed(2);
    drag.item.dataset.y = yPct.toFixed(2);
    console.info('[menu layout] drag move', { xPct: xPct.toFixed(2), yPct: yPct.toFixed(2) });
    if (drag.item === selectedItem) {
      scalePanel?.__updatePositionOutputs?.(selectedItem);
    }
  };

  const onUp = () => {
    if (!drag) return;
    const item = drag.item;
    const x = parseFloat(item.dataset.x ?? item.style.left);
    const y = parseFloat(item.dataset.y ?? item.style.top);
    try { item.releasePointerCapture?.(drag.pointerId); } catch {}
    item.removeEventListener('pointermove', onMove);
    item.removeEventListener('pointerup', onUp);
    item.removeEventListener('pointercancel', onUp);
    if (item === selectedItem) {
      scalePanel?.__updatePositionOutputs?.(selectedItem);
    }
    console.info(`[menu layout] ${labelFor(item, 0)} -> x:${x?.toFixed?.(2) ?? x}, y:${y?.toFixed?.(2) ?? y}`);
    drag = null;
  };

  menu.addEventListener('pointerdown', onDown);
  menu.addEventListener('pointermove', onMove);
  menu.addEventListener('pointerup', onUp);
  menu.addEventListener('pointercancel', onUp);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  window.addEventListener('keydown', (e) => {
    if (e.key?.toLowerCase() === 'd') {
      e.preventDefault();
      toggleLayout();
    }
    if (e.key === 'Escape' && layoutMode) toggleLayout(false);
  });

  window.printMenuPositions = () => {
    const items = Array.from(menu.querySelectorAll('.menu-item')).map((el, idx) => ({
      label: labelFor(el, idx),
      href: el.getAttribute('href') || '',
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0
    }));
    console.table(items);
    return items;
  };

}

// ===== modal navigation =====
function setupDesktopWindows() {
  const layer = document.getElementById('window-layer');
  const dock  = document.getElementById('win-dock');
  if (!menu || !layer) return;

  const loadedCSS = new Set();
  const loadedScripts = new Map();
  let zTop = 100; // z-index seed for windows
  let openCount = 0;
  const WIN_STATE_KEY = 'desktopWindows:v1';
  let windows = new Map(); // id -> meta

  const ensureStyles = async (styles = []) => {
    await Promise.all(styles.map((href) => {
      if (loadedCSS.has(href)) return Promise.resolve();
      return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.modalCss = href;
        link.onload = () => { loadedCSS.add(href); resolve(); };
        link.onerror = () => { console.warn('[modal] failed to load stylesheet', href); resolve(); };
        document.head.appendChild(link);
      });
    }));
  };

  const ensureScripts = async (scripts = []) => {
    await Promise.all(scripts.map((src) => {
      const existing = loadedScripts.get(src);
      if (existing) return existing;
      const script = document.createElement('script');
      script.src = src;
      script.defer = false;
      const promise = new Promise((resolve) => {
        script.onload = () => { resolve(); };
        script.onerror = () => { console.warn('[modal] failed to load script', src); resolve(); };
      });
      loadedScripts.set(src, promise);
      document.head.appendChild(script);
      return promise;
    }));
  };

  const normalizePath = (href) => {
    try {
      const url = new URL(href, window.location.href);
      return url.pathname.replace(/\/+/g, '/');
    } catch {
      return href;
    }
  };

  const persistState = () => {
    try {
      const data = Array.from(windows.values()).map(({ id, path, title, left, top, width, height, isMax, minimized, z }) => ({ id, path, title, left, top, width, height, isMax, minimized, z }));
      sessionStorage.setItem(WIN_STATE_KEY, JSON.stringify(data));
    } catch {}
  };

  const restoreState = async () => {
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem(WIN_STATE_KEY) || '[]'); } catch { data = null; }
    if (!Array.isArray(data)) return;
    for (const meta of data) {
      await openWindow(meta.path, MODAL_PAGE_MAP[meta.path] || {}, meta.title, meta);
    }
  };

  // Open a single preferred window (info) once
  let __singleInfoOpened = false;
  const INFO_OPENED_KEY = 'infoAutoOpened:v1';
  function openSingleInfoWindow() {
    // Avoid opening more than once per tab session
    try { if (sessionStorage.getItem(INFO_OPENED_KEY) === '1') return false; } catch {}
    if (__singleInfoOpened) return false;
    try {
      const cfg = MODAL_PAGE_MAP['/info.html'] || {};
      openPopupWindow('info.html', 'info', cfg);
      __singleInfoOpened = true;
      try { sessionStorage.setItem(INFO_OPENED_KEY, '1'); } catch {}
      return true;
    } catch { return false; }
  }

  const fetchWindowContent = async (path) => {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const root = doc.querySelector('[data-modal-root]') || doc.querySelector('main') || doc.body;
    const title = (doc.querySelector('title')?.textContent || '').trim();
    const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]')).map(n=>n.getAttribute('href')).filter(Boolean);
    const scripts = Array.from(doc.querySelectorAll('script[src]')).map(n=>n.getAttribute('src')).filter(Boolean);
    return { title, root, styles, scripts };
  };
  const createWindowEl = (title) => {
    const dw = document.createElement('section');
    dw.className = 'dw';
    dw.style.zIndex = String(++zTop);
    dw.style.left = 20 + (openCount * 24) % 140 + 'px';
    dw.style.top  = 20 + (openCount * 18) % 120 + 'px';

    dw.innerHTML = `
      <header class="dw-header" data-drag-handle>
        <div class="dw-traffic">
          <button class="dw-dot dw-close" title="Close" aria-label="Close"></button>
          <button class="dw-dot dw-min" title="Minimize" aria-label="Minimize"></button>
          <button class="dw-dot dw-max" title="Fullscreen" aria-label="Fullscreen"></button>
        </div>
        <h2 class="dw-title">${(title || '').toLowerCase()}</h2>
        <button class="dw-ghost" title="Passthrough" aria-label="Passthrough">👻</button>
      </header>
      <div class="dw-body"></div>
    `;
    return dw;
  };

  const mountWindowContent = (dw, root, config) => {
    const bodyEl = dw.querySelector('.dw-body');
    bodyEl.innerHTML = '';
    if (!root) { bodyEl.innerHTML = '<p style="padding:12px">No content found.</p>'; return; }
    const clone = root.cloneNode(true);
    clone.removeAttribute('data-modal-root');
    bodyEl.appendChild(clone);
    config?.init?.(bodyEl);
  };

  const bringToFront = (dw) => { dw.style.zIndex = String(++zTop); };

  const enableDrag = (dw) => {
    const handle = dw.querySelector('[data-drag-handle]');
    let drag = null;
    const onDown = (e) => {
      bringToFront(dw);
      drag = { x: e.clientX, y: e.clientY, left: dw.offsetLeft, top: dw.offsetTop };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp, { once: true });
    };
    const onMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      dw.style.left = drag.left + dx + 'px';
      dw.style.top  = drag.top + dy + 'px';
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      drag = null;
    };
    handle?.addEventListener('pointerdown', onDown);
    dw.addEventListener('mousedown', () => bringToFront(dw));
  };

  const openWindow = async (path, config, fallbackTitle = '', restoreMeta) => {
    try {
      const { title, root, styles, scripts } = await fetchWindowContent(path);
      await ensureStyles([...(config?.css||[]), ...(styles||[])]);
      await ensureScripts([...(config?.scripts||[]), ...(scripts||[])]);
      const dw = createWindowEl(title || fallbackTitle);
      layer.appendChild(dw);
      bringToFront(dw);
      // Apply window config (initial size/resizable)
      const wcfg = config?.window || {};
      if (wcfg.width)  dw.style.width  = Math.max(280, wcfg.width) + 'px';
      if (wcfg.height) dw.style.height = Math.max(220, wcfg.height) + 'px';
      if (wcfg.resizable === false) {
        dw.classList.add('dw--fixed');
      }
      enableDrag(dw);
      mountWindowContent(dw, root, config);
      openCount++;
      const closeEl = dw.querySelector('.dw-close');
      const maxEl = dw.querySelector('.dw-max');
      const minEl = dw.querySelector('.dw-min');
      const ghostEl = dw.querySelector('.dw-ghost');
      // prevent dragging when clicking controls
      [closeEl, maxEl, minEl, ghostEl].forEach(btn => btn?.addEventListener('pointerdown', (ev)=>ev.stopPropagation()));
      closeEl?.addEventListener('click', () => dw.remove());
      maxEl?.addEventListener('click', () => dw.classList.toggle('dw--max'));
      dw.querySelector('.dw-header')?.addEventListener('dblclick', () => dw.classList.toggle('dw--max'));
      ghostEl?.addEventListener('click', () => { dw.classList.toggle('dw--ghost'); const m = windows.get(id); if (m){ m.ghost = dw.classList.contains('dw--ghost'); persistState(); } });

      // track + persist
      const id = Math.random().toString(36).slice(2);
      const meta = { id, path, title: (title||fallbackTitle||'').toLowerCase(), left: dw.offsetLeft, top: dw.offsetTop, width: dw.offsetWidth, height: dw.offsetHeight, isMax:false, minimized:false, ghost:false, z: Number(dw.style.zIndex||0) };
      windows.set(id, meta); persistState();

      const ro = new ResizeObserver(() => {
        const m = windows.get(id); if (!m) return;
        m.width = dw.offsetWidth; m.height = dw.offsetHeight; persistState();
      });
      ro.observe(dw);

      const updatePos = () => { const m = windows.get(id); if (!m) return; m.left = dw.offsetLeft; m.top = dw.offsetTop; m.z = Number(dw.style.zIndex||0); persistState(); };
      dw.addEventListener('pointerup', updatePos);
      dw.addEventListener('mousedown', () => { bringToFront(dw); const m=windows.get(id); if (m){ m.z=Number(dw.style.zIndex||0); persistState(); }});

      const makeDockItem = () => {
        const btn = document.createElement('button');
        btn.className = 'dock-item';
        btn.textContent = meta.title || 'window';
        btn.addEventListener('click', () => {
          meta.minimized = false; persistState();
          dw.style.display = '';
          dock?.removeChild(btn);
          bringToFront(dw);
        });
        return btn;
      };
      let dockBtn = null;
      minEl?.addEventListener('click', () => {
        if (!dock) return;
        meta.minimized = true; persistState();
        dw.style.display = 'none';
        dockBtn = dockBtn || makeDockItem();
        if (!dock.contains(dockBtn)) dock.appendChild(dockBtn);
      });
      closeEl?.addEventListener('click', () => {
        windows.delete(id); persistState();
        if (dockBtn && dock?.contains(dockBtn)) dock.removeChild(dockBtn);
      }, { once:true });

      // Restore geometry/state if provided
      if (restoreMeta) {
        dw.style.left = (restoreMeta.left ?? dw.offsetLeft) + 'px';
        dw.style.top  = (restoreMeta.top ?? dw.offsetTop) + 'px';
        dw.style.width  = (restoreMeta.width ?? dw.offsetWidth) + 'px';
        dw.style.height = (restoreMeta.height ?? dw.offsetHeight) + 'px';
        if (restoreMeta.isMax) dw.classList.add('dw--max');
        if (restoreMeta.ghost) dw.classList.add('dw--ghost');
        if (restoreMeta.minimized && dock) {
          dw.style.display = 'none';
          dockBtn = dockBtn || makeDockItem();
          if (!dock.contains(dockBtn)) dock.appendChild(dockBtn);
        }
        meta.left = dw.offsetLeft; meta.top = dw.offsetTop; meta.width = dw.offsetWidth; meta.height = dw.offsetHeight; meta.isMax = dw.classList.contains('dw--max'); meta.minimized = restoreMeta.minimized || false; meta.ghost = dw.classList.contains('dw--ghost'); persistState();
      }
    } catch (err) {
      console.error('[window] load error', err);
    }
  };

  // Native popup helper (used by menu and pre-open logic)
  let popupIdx = 0;
  function openPopupWindow(path, title, cfg) {
    try {
      const w = Math.round(cfg?.window?.width || 1000);
      const h = Math.round(cfg?.window?.height || 760);
      let left = Math.max(0, 40 + (popupIdx * 28) % Math.max(200, (screen.availWidth || innerWidth) - w));
      let top  = Math.max(0,  40 + (popupIdx * 24) % Math.max(200, (screen.availHeight || innerHeight) - h));
      if (Number.isFinite(cfg?.window?.left)) left = cfg.window.left;
      if (Number.isFinite(cfg?.window?.top))  top  = cfg.window.top;
      popupIdx++;
      const res = cfg?.window?.resizable === false ? 'no' : 'yes';
      // Include classic popup hints; some browsers treat sized windows as popups (separate window)
      const featureParts = [
        `resizable=${res}`,
        'scrollbars=yes',
        'toolbar=no',
        'menubar=no',
        'location=no',
        'status=no',
        `width=${w}`,
        `height=${h}`,
        `left=${left}`,
        `top=${top}`
      ];
      const features = featureParts.join(',');
      const href = path && path !== 'about:blank'
        ? new URL(path + (path.includes('?') ? '&' : '?') + 'popup=1', window.location.href).href
        : 'about:blank';
      // Try opening a named, empty window first, then navigate — often more reliable
      const name = `win_${Date.now()}_${Math.floor(Math.random()*1e5)}`;
      console.log('[popups] window.open (blank then nav) attempt', { href, features, name });
      let win = window.open('', name, features);
      if (win) {
        try { win.location.href = href; } catch {}
      }
      if (!win) {
        console.warn('[popups] blank+nav blocked; trying direct with features');
        try { win = window.open(href, '_blank', features); } catch {}
      }
      if (!win) {
        console.warn('[popups] feature popup blocked; trying plain');
        try { win = window.open(href, '_blank'); } catch {}
      }
      if (!win) {
        console.warn('[popups] plain window.open blocked; trying anchor click');
        try {
          const a = document.createElement('a');
          a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {}
        return null;
      }
      try { if (typeof win.focus === 'function') win.focus(); } catch {}
      console.log('[popups] window.open result (separate window depends on browser prefs)', !!win);
      return win;
    } catch { return null; }
  }

  // Build absolute URL consistently
  function absUrl(path){ try { return new URL(path, window.location.href).href; } catch { return path; } }

  // Open all target windows via a single hub popup (improves Chrome reliability)
  function openAllViaHubNow() {
    try {
      const hub = window.open('about:blank', '_blank', 'popup=yes,resizable=yes,scrollbars=yes,noopener=yes,noreferrer=yes,width=420,height=300,left=60,top=60');
      if (!hub) return false;
      const paths = getFunctionalPaths();
      let i = 0;
      const items = paths.map((p) => {
        const cfg = MODAL_PAGE_MAP[p] || {};
        const w = Math.round(cfg?.window?.width || 1000);
        const h = Math.round(cfg?.window?.height || 760);
        const left = Math.max(0, 40 + (i * 28) % Math.max(200, (screen.availWidth || innerWidth) - w));
        const top  = Math.max(0,  40 + (i * 24) % Math.max(200, (screen.availHeight || innerHeight) - h));
        i++;
        const res = cfg?.window?.resizable === false ? 'no' : 'yes';
        const features = `popup=yes,resizable=${res},scrollbars=yes,noopener=yes,noreferrer=yes,width=${w},height=${h},left=${left},top=${top}`;
        const url = absUrl(p + (p.includes('?') ? '&' : '?') + 'popup=1');
        return { url, features };
      });
      const payload = JSON.stringify(items);
      hub.document.open();
      hub.document.write(`<!doctype html><meta charset="utf-8"><title>opening…</title><body style="font:12px Helvetica,Arial,sans-serif;padding:8px">opening…<script>(function(){try{var items=${payload};for(var i=0;i<items.length;i++){var it=items[i];try{window.open(it.url,'_blank',it.features);}catch(e){}}}catch(e){}setTimeout(function(){try{window.close()}catch(e){}},200);})();<\/script>`);
      hub.document.close();
      try { hub.focus && hub.focus(); } catch {}
      return true;
    } catch { return false; }
  }

  const getFunctionalPaths = () => [
    'moodboard.html',
    'gallery.html',
    'info.html',
    'bio.html',
    'playlist.html',
    'cassette.html',
    'projects.html'
  ];

  // Pre-open one tiny about:blank popup using the user gesture, push it off-screen, blur it, and refocus main.
  function preOpenFunctionalWindows() {
    const paths = getFunctionalPaths();
    preOpened = [];
    const first = paths[0];
    if (!first) return;
    const cfg = MODAL_PAGE_MAP[first] || {};
    const tinyCfg = { ...cfg, window: { width: 10, height: 10, resizable: true, left: -20000, top: -20000 } };
    const win = openPopupWindow('about:blank', first, tinyCfg);
    if (win) {
      try { win.document.title = first.toLowerCase(); } catch {}
      try {
        // Attempt to keep it out of view
        if (typeof win.moveTo === 'function') win.moveTo(-20000, -20000);
        if (typeof win.resizeTo === 'function') win.resizeTo(10, 10);
        win.blur(); window.focus();
      } catch {}
      preOpened.push({ win, path: first });
      console.log('[popups] pre-opened tiny blank window for', first);
    } else {
      console.warn('[popups] failed to pre-open tiny window');
    }
  }

  const handleMenuClick = (event) => {
    const link = event.target.closest('a.menu-item');
    if (!link) return;
    if (body.classList.contains('dev')) {
      event.preventDefault();
      return;
    }
    const path = normalizePath(link.getAttribute('href') || '');
    const config = MODAL_PAGE_MAP[path] || {};
    const title = link.textContent || link.getAttribute('aria-label') || '';
    event.preventDefault();
    openPopupWindow(path, title, config);
  };

  menu.addEventListener('click', handleMenuClick);

  // Less obtrusive chip in bottom-right to open windows
  // chip removed

  const openAllFunctionalWindows = async () => {
    // Navigate pre-opened windows if we have them; otherwise attempt fresh popups
    if (preOpened && preOpened.length) {
      for (const { win, path } of preOpened) {
        try { if (win && !win.closed) win.location.href = new URL(path + (path.includes('?') ? '&' : '?') + 'popup=1', window.location.href).href; } catch {}
      }
      return;
    }
    const paths = getFunctionalPaths();
    for (const path of paths) {
      const cfg = MODAL_PAGE_MAP[path] || {};
      openPopupWindow(path, path, cfg);
      await new Promise(r => setTimeout(r, 40));
    }
  };

  // Synchronous variant to maximize popup success; called directly from a user gesture
  function openAllFunctionalWindowsNow() {
    const paths = getFunctionalPaths();
    if (!paths.length) return true;
    // Prefer hub (single popup that opens others). If it fails, open each directly.
    if (openAllViaHubNow()) return true;
    for (const path of paths) {
      const cfg = MODAL_PAGE_MAP[path] || {};
      openPopupWindow(path, path, cfg);
    }
    return true;
  }

  // Expose popup helpers globally so outer intro logic can invoke them
  try {
    window.__OPEN_POPUPS_NOW = openAllFunctionalWindowsNow;
    window.__OPEN_POPUPS_NAV = openAllFunctionalWindows;
  } catch {}

  const showOpenWindowsPrompt = () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open windows';
    Object.assign(btn.style, {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: 20000,
      padding: '10px 14px', borderRadius: '8px', border: '1px solid #666',
      background: '#111', color: '#eee', cursor: 'pointer'
    });
    btn.addEventListener('click', async () => {
      btn.remove();
      await openAllFunctionalWindows();
    }, { once: true });
    document.body.appendChild(btn);
  };

  // When the intro completes, open the info window only
  document.addEventListener('intro:done', () => {
    openSingleInfoWindow();
  }, { once: true });

  // open internal links anywhere in-window by default; Shift+click forces window even if marked
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    // Menu clicks are handled separately
    if (menu && menu.contains(a)) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;
    const path = normalizePath(href);
    if (a.dataset.window === 'native') return;
    const wantPopup = e.shiftKey || true; // default to popup
    if (wantPopup) {
      e.preventDefault();
      const cfg = MODAL_PAGE_MAP[path] || {};
      const ok = openPopupWindow(path, a.textContent || a.getAttribute('aria-label') || path, cfg);
      if (!ok) openWindow(path, cfg, a.textContent || path);
    }
  });

  // Shift+click on any element with data-open forces new window with that href
  document.addEventListener('contextmenu', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href) return;
    const path = normalizePath(href);
    e.preventDefault();
    const ok = openPopupWindow(path, a.textContent || path);
    if (!ok) openWindow(path, MODAL_PAGE_MAP[path] || {}, a.textContent || path);
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // close the top-most window
      const tops = Array.from(layer.querySelectorAll('.dw')).sort((a,b)=>Number(b.style.zIndex||0)-Number(a.style.zIndex||0));
      if (tops[0]) tops[0].querySelector('.dw-close')?.click();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const tops = Array.from(layer.querySelectorAll('.dw')).sort((a,b)=>Number(b.style.zIndex||0)-Number(a.style.zIndex||0));
      if (tops[0]) tops[0].classList.toggle('dw--max');
    }
  });

  restoreState();

  // Expose single opener globally so top-level branch can invoke it when intro is skipped
  try { window.__OPEN_SINGLE_INFO__ = openSingleInfoWindow; } catch {}
}

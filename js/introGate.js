import { loadMenu } from './menuLoader.js';

const body  = document.body;
const stage = document.getElementById('stage');
const video = document.getElementById('introVideo');
const menu  = document.getElementById('menu');

const MODAL_PAGE_MAP = {
  '/bio.html': {
    css: ['css/bio.css'],
    // Wider bio window for comfortable layout
    window: { width: 860, height: 640, resizable: true }
  },
  '/info.html': {
    css: ['css/info.css'],
    scripts: ['js/info-hotspot.js'],
    // Open the info page nearly full size for readability
    window: { width: 1100, height: 820, resizable: true },
    init(root) {
      if (typeof window.initInfoHotspot === 'function') window.initInfoHotspot(root);
    }
  },
  '/moodboard.html': {
    css: ['css/moodboard.css'],
    scripts: ['js/moodboard.js'],
    window: { width: 420, height: 720, resizable: true },
    init(root) {
      if (typeof window.initMoodboard === 'function') window.initMoodboard(root);
    }
  },
  '/gallery.html': {
    css: ['css/moodboard.css'],
    scripts: ['js/gallery.js'],
    window: { width: 420, height: 720, resizable: true },
    init(root) {
      if (typeof window.initGallery === 'function') window.initGallery(root);
    }
  },
  '/playlist.html': {
    window: { width: 300, height: 520, resizable: false }
  }
  ,
  '/projects.html': {
    // Large window for PDF viewing
    window: { width: 1100, height: 820, resizable: true }
  }
};

let hasStarted = false;   // first click starts with audio
let isRevealing = false;  // guard

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
setupDesktopWindows();

// If the intro was already seen, skip video immediately
if (alreadySeen) {
  body.classList.remove('intro-dark');
  body.classList.add('intro-light');
  menu.classList.add('show');
  if (video) video.classList.add('is-hidden'); // make sure video never blocks clicks
  syncMenuToCanvasBox();

  markIntroSeen();
} else {
  // fresh visit: start dark letterbox until reveal
  body.classList.add('intro-dark');

  if (stage && video) {
    // first click starts video with sound, second click reveals
    stage.addEventListener('click', async () => {
      if (menu.classList.contains('show') || isRevealing) return;

      if (!hasStarted) {
        try {
          video.muted = false;
          video.volume = 0.9;
          await video.play();
          hasStarted = true;
        } catch (err) {
          console.warn('[intro] play failed:', err?.name || err);
        }
        return; // don’t skip on first click
      }

      endIntroFlow(); // second click
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

/* ===== pin menu to media rect (fallback to stage if video hidden) ===== */
function rectOfTarget() {
  if (video) {
    const r = video.getBoundingClientRect();
    // if hidden or zero-sized, fall back to stage
    if ((r.width > 0 && r.height > 0) && !video.classList.contains('is-hidden')) return r;
  }
  return (stage ? stage.getBoundingClientRect() : { left:0, top:0, width:window.innerWidth, height:window.innerHeight });
}

function syncMenuToCanvasBox() {
  if (!menu) return;
  const r = rectOfTarget();
  Object.assign(menu.style, {
    left:  r.left + 'px',
    top:   r.top + 'px',
    width: r.width + 'px',
    height:r.height + 'px',
    pointerEvents: menu.classList.contains('show') ? 'auto' : 'none'
  });
}
['loadedmetadata','loadeddata','load'].forEach(ev => window.addEventListener(ev, syncMenuToCanvasBox));
window.addEventListener('resize',            () => setTimeout(syncMenuToCanvasBox, 50));
window.addEventListener('orientationchange', () => setTimeout(syncMenuToCanvasBox, 150));
window.addEventListener('fullscreenchange',  syncMenuToCanvasBox);
requestAnimationFrame(syncMenuToCanvasBox);

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

  // Prefer real popup windows like handbook.org; fall back to in-page window if blocked
  let popupIdx = 0;
  function openPopupWindow(path, title, cfg) {
    try {
      const w = Math.round(cfg?.window?.width || 1000);
      const h = Math.round(cfg?.window?.height || 760);
      const left = Math.max(0, 40 + (popupIdx * 28) % (screen.availWidth - w));
      const top  = Math.max(0,  40 + (popupIdx * 24) % (screen.availHeight - h));
      popupIdx++;
      const res = cfg?.window?.resizable === false ? 'no' : 'yes';
      const features = `popup=yes,resizable=${res},scrollbars=yes,width=${w},height=${h},left=${left},top=${top}`;
      const href = path + (path.includes('?') ? '&' : '?') + 'popup=1';
      const win = window.open(href, '_blank', features);
      if (win && typeof win.focus === 'function') win.focus();
      return !!win;
    } catch { return false; }
  }

  const handleMenuClick = (event) => {
    const link = event.target.closest('a.menu-item');
    if (!link) return;
    const path = normalizePath(link.getAttribute('href') || '');
    const config = MODAL_PAGE_MAP[path] || {};
    const title = link.textContent || link.getAttribute('aria-label') || '';
    event.preventDefault();
    const ok = openPopupWindow(path, title, config);
    if (!ok) {
      openWindow(path, config, title);
    }
  };

  menu.addEventListener('click', handleMenuClick);

  // When the intro is done, automatically open all functional pages in windows
  // (based on MODAL_PAGE_MAP). Use in-page windows to avoid native popup blockers.
  document.addEventListener('intro:done', async () => {
    try {
      const paths = Object.keys(MODAL_PAGE_MAP || {});
      // Open sequentially to preserve offset stacking and reduce jank
      for (const path of paths) {
        // Skip root or index if ever present
        if (!path || path === '/' || path === '/index.html') continue;
        const cfg = MODAL_PAGE_MAP[path] || {};
        await openWindow(path, cfg, (path || '').replace(/^\//, ''));
      }
    } catch (err) {
      console.warn('[intro] auto-open windows failed', err);
    }
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
}

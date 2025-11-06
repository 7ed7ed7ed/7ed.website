// js/moodboard.js
const CONTAINER_SELECTOR = '#masonry';
const LIGHTBOX_SELECTOR  = '#lightbox';
// Potential JSON locations (module-relative first, then absolute from origin, then page-relative)
const DATA_URLS = [
  new URL('../data/moodboard.json', import.meta.url).toString(),
  new URL('/data/moodboard.json', window.location.origin).toString(),
  'data/moodboard.json'
];

function fetchWithTimeout(resource, options = {}) {
  const { timeout = 10000, ...rest } = options;
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    fetch(resource, { ...rest, signal: controller.signal })
      .then((r) => { clearTimeout(id); resolve(r); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

const stripTrailingCommas = (t) =>
  t.replace(/,\s*([\]\}])/g, '$1').replace(/^\uFEFF/, '');

const extOf = (p) => {
  const q = p.split('?')[0].split('#')[0];
  const parts = q.split('.');
  return (parts.length > 1 ? parts.pop() : '').toLowerCase();
};

const guessMime = (src) => {
  const e = extOf(src);
  if (e === 'mp4' || e === 'm4v') return 'video/mp4';
  if (e === 'webm') return 'video/webm';
  if (e === 'mov' || e === 'qt') return 'video/quicktime';
  return '';
};

const isLikelyVideo = (item) => {
  if (Array.isArray(item.sources) && item.sources.length) return true;
  const e = extOf(item.src || '');
  return ['mp4', 'mov', 'webm', 'm4v'].includes(e);
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createTile(item, { onOpenLightbox }) {
  const fig = document.createElement('figure');
  fig.className = 'mood-tile';

  if (isLikelyVideo(item)) {
    const video = document.createElement('video');
    video.className = 'mood-video';
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.controls = true;

    if (Array.isArray(item.sources) && item.sources.length) {
      item.sources.forEach((s) => {
        const source = document.createElement('source');
        source.src = encodeURI(s.src);
        source.type = s.type || guessMime(s.src) || '';
        video.appendChild(source);
      });
    } else if (item.src) {
      const source = document.createElement('source');
      source.src = encodeURI(item.src);
      source.type = guessMime(item.src) || '';
      video.appendChild(source);
    }

    video.appendChild(
      document.createTextNode('Your browser does not support the provided video formats.')
    );

    fig.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.className = 'mood-img';
    img.src = encodeURI(item.src);
    img.alt = item.alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('click', () => onOpenLightbox(img.src, item.caption || ''));
    fig.appendChild(img);
  }

  if (item.caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = item.caption;
    fig.appendChild(cap);
  }

  return fig;
}

function setupVideoAutoplay(root) {
  const vids = root.querySelectorAll('video');
  if (!('IntersectionObserver' in window) || vids.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          const p = v.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else {
          v.pause();
        }
      });
    },
    { root: null, rootMargin: '200px 0px', threshold: 0.1 }
  );

  vids.forEach((v) => io.observe(v));
}

function createLightboxController(base = document) {
  const lb = base.querySelector(LIGHTBOX_SELECTOR);
  if (!lb) return () => {};
  const lbImg = lb.querySelector('#lbImg');
  const lbCap = lb.querySelector('#lbCap');
  const closeBtn = lb.querySelector('.lb-close');

  const closeLightbox = () => {
    lb.hidden = true;
    if (lbImg) lbImg.src = '';
    document.removeEventListener('keydown', onEsc);
  };

  const onEsc = (e) => {
    if (e.key === 'Escape') closeLightbox();
  };

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => {
    if (e.target === lb) closeLightbox();
  });

  return (src, caption) => {
    if (lbImg) lbImg.src = src;
    if (lbCap) lbCap.textContent = caption || '';
    lb.hidden = false;
    document.addEventListener('keydown', onEsc, { once: true });
  };
}

async function loadMoodboard(base = document) {
  const container = base.querySelector(CONTAINER_SELECTOR);
  if (!container) {
    console.warn('[moodboard] container not found:', CONTAINER_SELECTOR);
    return;
  }
  container.innerHTML = '<div style="padding:12px;opacity:.6">Loading…</div>';

  let text = null; let used = null; let lastErr = null;
  for (const url of DATA_URLS) {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-cache', timeout: 12000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      used = url;
      break;
    } catch (e) { lastErr = e; }
  }
  if (text == null) {
    container.innerHTML = '<div style="padding:12px;color:#000"><b>Could not load moodboard.json</b><br/><small>Check console for details.</small></div>';
    console.error('[moodboard] fetch failed. Tried:', DATA_URLS, 'last error:', lastErr);
    return;
  }

  let items;
  try {
    items = JSON.parse(stripTrailingCommas(text));
  } catch (e) {
    container.innerHTML = '<div style="padding:12px;color:#000"><b>Invalid JSON in moodboard.json</b></div>';
    console.error('[moodboard] JSON parse error:', e);
    return;
  }

  // Randomize order on every open
  items = shuffle(items).map((it) =>
    isLikelyVideo(it) && !it.sources
      ? { ...it, type: 'video', sources: [{ src: it.src, type: guessMime(it.src) || undefined }] }
      : it
  );

  const openLightbox = createLightboxController(base);
  const frag = document.createDocumentFragment();
  items.forEach((it) => {
    frag.appendChild(createTile(it, { onOpenLightbox: openLightbox }));
  });
  container.innerHTML = '';
  container.appendChild(frag);
  setupVideoAutoplay(container);

  console.log(`[moodboard] loaded ${items.length} items from`, used);
}

function initMoodboard(base = document) {
  loadMoodboard(base);
}

if (document.readyState !== 'loading') initMoodboard();
else document.addEventListener('DOMContentLoaded', () => initMoodboard());

if (typeof window !== 'undefined') {
  window.initMoodboard = initMoodboard;
}

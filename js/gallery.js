// js/gallery.js — same layout/behavior as moodboard, but loads data/gallery.json (images/gallery/*)
const CONTAINER_SELECTOR = '#masonry';
const LIGHTBOX_SELECTOR  = '#lightbox';
const DATA_URLS = [
  new URL('../data/gallery.json', import.meta.url).toString(),
  new URL('/data/gallery.json', window.location.origin).toString(),
  'data/gallery.json'
];

const stripTrailingCommas = (t) => t.replace(/,\s*([\]\}])/g, '$1').replace(/^\uFEFF/, '');

const extOf = (p) => {
  const q = (p||'').split('?')[0].split('#')[0];
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

function createTile(item, { onOpenLightbox }) {
  const fig = document.createElement('figure');
  fig.className = 'mood-tile';
  const fileName = (item.src||'').split('?')[0].split('#')[0].split('/').pop() || '';
  if (isLikelyVideo(item)) {
    const video = document.createElement('video');
    video.className = 'mood-video';
    video.playsInline = true; video.muted = true; video.loop = true; video.autoplay = true; video.controls = true;
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
    video.appendChild(document.createTextNode('Your browser does not support the provided video formats.'));
    fig.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.className = 'mood-img';
    img.src = encodeURI(item.src);
    img.alt = item.alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('click', () => onOpenLightbox(img.src, fileName));
    fig.appendChild(img);
  }
  // No inline caption beneath tiles on gallery page; show only in lightbox
  return fig;
}

function createLightboxController(base = document) {
  const lb = base.querySelector(LIGHTBOX_SELECTOR);
  if (!lb) return () => {};
  const lbImg = lb.querySelector('#lbImg');
  const lbCap = lb.querySelector('#lbCap');
  const closeBtn = lb.querySelector('.lb-close');
  const close = () => { lb.hidden = true; if (lbImg) lbImg.src = ''; document.removeEventListener('keydown', onEsc); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  closeBtn?.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  return (src, caption) => { if (lbImg) lbImg.src = src; if (lbCap) lbCap.textContent = caption || ''; lb.hidden = false; document.addEventListener('keydown', onEsc, { once:true }); };
}

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

async function loadGallery(base = document) {
  const container = base.querySelector(CONTAINER_SELECTOR);
  if (!container) return;
  container.innerHTML = '<div style="padding:12px;opacity:.6">Loading…</div>';

  let text = null, used=null, lastErr=null;
  for (const url of DATA_URLS) {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-cache', timeout: 12000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text(); used=url; break;
    } catch (e) { lastErr = e; }
  }
  if (text == null) {
    container.innerHTML = '<div style="padding:12px;color:#000"><b>Could not load gallery.json</b></div>';
    console.error('[gallery] fetch failed:', DATA_URLS, lastErr);
    return;
  }

  let items;
  try { items = JSON.parse(stripTrailingCommas(text)); }
  catch(e){ container.innerHTML = '<div style="padding:12px;color:#000"><b>Invalid JSON in gallery.json</b></div>'; console.error('[gallery] JSON parse error', e); return; }

  // Keep JSON order (newest-first from the builder)
  items = items.map((it) => isLikelyVideo(it) && !it.sources ? { ...it, type:'video', sources:[{ src: it.src, type: guessMime(it.src) || undefined }] } : it);

  const openLightbox = createLightboxController(base);
  const frag = document.createDocumentFragment();
  let lastYear = null;
  items.forEach((it) => {
    let year = null;
    if (it.dateAdded) { try { year = new Date(it.dateAdded).getFullYear(); } catch {} }
    if (year && year !== lastYear) {
      const ym = document.createElement('div');
      ym.className = 'year-marker';
      const lab = document.createElement('div');
      lab.className = 'ym-label';
      lab.textContent = String(year);
      ym.appendChild(lab);
      frag.appendChild(ym);
      lastYear = year;
    }
    frag.appendChild(createTile(it, { onOpenLightbox: openLightbox }));
  });
  container.innerHTML = '';
  container.appendChild(frag);
  console.log('[gallery] loaded', items.length, 'items from', used);
}

function initGallery(base=document){ loadGallery(base); }
if (document.readyState !== 'loading') initGallery();
else document.addEventListener('DOMContentLoaded', () => initGallery());
if (typeof window !== 'undefined') window.initGallery = initGallery;

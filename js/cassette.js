// js/cassette.js — YouTube links as tiles using moodboard masonry styles
const CONTAINER_SELECTOR = '#masonry';
const DATA_URLS = [
  new URL('../data/cassette.json', import.meta.url).toString(),
  new URL('/data/cassette.json', window.location.origin).toString(),
  'data/cassette.json'
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

const stripTrailingCommas = (t) => (t || '').replace(/,\s*([\]\}])/g, '$1').replace(/^\uFEFF/, '');

function ytIdFromUrl(raw) {
  try {
    const url = new URL(raw, 'https://youtube.com');
    // youtu.be/VIDEOID
    if (url.hostname.includes('youtu.be')) return url.pathname.replace(/^\//, '').split('/')[0];
    // youtube.com/watch?v=VIDEOID or share variants
    if (url.searchParams.has('v')) return url.searchParams.get('v');
    // youtube.com/shorts/VIDEOID or /embed/VIDEOID
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'v');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  } catch {}
  // fallback: basic regex
  const m = String(raw).match(/[?&]v=([\w-]{11})/) || String(raw).match(/youtu\.be\/([\w-]{11})/);
  return m ? m[1] : '';
}

function ytThumbUrl(id) {
  // Use hqdefault for reliability (maxres can 404 for some videos)
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

function createTile(item) {
  const url = item.url || item.href || '';
  const id = item.id || ytIdFromUrl(url);
  if (!id) return null;

  const fig = document.createElement('figure');
  fig.className = 'mood-tile';

  const a = document.createElement('a');
  a.href = item.url || `https://www.youtube.com/watch?v=${id}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'block';

  const img = document.createElement('img');
  img.className = 'mood-img';
  img.src = ytThumbUrl(id);
  img.alt = item.title || item.alt || 'YouTube video';
  img.loading = 'lazy';
  img.decoding = 'async';

  a.appendChild(img);
  fig.appendChild(a);

  if (item.title) {
    const cap = document.createElement('figcaption');
    cap.textContent = item.title;
    fig.appendChild(cap);
  }

  return fig;
}

async function loadCassette(base = document) {
  const container = base.querySelector(CONTAINER_SELECTOR);
  if (!container) return;
  container.innerHTML = '<div style="padding:12px;opacity:.6">Loading…</div>';

  let text = null; let used = null; let lastErr = null;
  for (const url of DATA_URLS) {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-cache', timeout: 12000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text(); used = url; break;
    } catch (e) { lastErr = e; }
  }
  if (text == null) {
    container.innerHTML = '<div style="padding:12px;color:#000"><b>Could not load cassette.json</b></div>';
    console.error('[cassette] fetch failed:', DATA_URLS, lastErr);
    return;
  }

  let items;
  try { items = JSON.parse(stripTrailingCommas(text)); }
  catch(e){ container.innerHTML = '<div style="padding:12px;color:#000"><b>Invalid JSON in cassette.json</b></div>'; console.error('[cassette] JSON parse error', e); return; }

  const frag = document.createDocumentFragment();
  items.forEach((it) => {
    const tile = createTile(it);
    if (tile) frag.appendChild(tile);
  });
  container.innerHTML = '';
  container.appendChild(frag);
  console.log(`[cassette] loaded ${items.length} items from`, used);
}

function initCassette(base = document) { loadCassette(base); }

if (document.readyState !== 'loading') initCassette();
else document.addEventListener('DOMContentLoaded', () => initCassette());

if (typeof window !== 'undefined') window.initCassette = initCassette;


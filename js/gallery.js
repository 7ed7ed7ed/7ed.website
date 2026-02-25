const DATA_URLS = [
  new URL('../data/gallery.json', import.meta.url).toString(),
  new URL('/data/gallery.json', window.location.origin).toString(),
  'data/gallery.json'
];

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg']);

let items = [];
let activeIndex = 0;
let refs = null;
let controlsBound = false;

const stripTrailingCommas = (t) => t.replace(/,\s*([\]\}])/g, '$1').replace(/^\uFEFF/, '');

function extOf(path = '') {
  const q = path.split('?')[0].split('#')[0];
  const parts = q.split('.');
  return (parts.length > 1 ? parts.pop() : '').toLowerCase();
}

function fileNameOf(path = '') {
  return path.split('?')[0].split('#')[0].split('/').pop() || 'untitled';
}

function titleFromItem(item) {
  const raw = (item.caption || item.alt || fileNameOf(item.src)).toString().trim();
  return raw || 'untitled';
}

function formatType(item) {
  const ext = extOf(item.src).toUpperCase();
  const kind = mediaKind(item);
  return ext ? `${kind} (${ext})` : kind;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mediaKind(item) {
  const ext = extOf(item?.src || '');
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'image';
}

function isRenderableMedia(item) {
  const ext = extOf(item?.src || '');
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

function getRefs(base = document) {
  return {
    shell: base.querySelector('.oeuvre-shell'),
    head: base.querySelector('.oeuvre-head'),
    main: base.querySelector('.oeuvre-main'),
    updated: base.querySelector('#oeuvre-updated'),
    counter: base.querySelector('#oeuvre-counter'),
    thumbs: base.querySelector('#oeuvre-thumbs'),
    prev: base.querySelector('#oeuvre-prev'),
    next: base.querySelector('#oeuvre-next'),
    stage: base.querySelector('.oeuvre-stage'),
    image: base.querySelector('#oeuvre-image'),
    video: base.querySelector('#oeuvre-video'),
    metaTitle: base.querySelector('#meta-title'),
    metaType: base.querySelector('#meta-type')
  };
}

function formatUpdatedDate(value) {
  if (!value) return 'unknown';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clampIndex(idx) {
  if (!items.length) return 0;
  return ((idx % items.length) + items.length) % items.length;
}

function openLargeWindow(item) {
  const src = item?.src || '';
  const caption = titleFromItem(item);
  if (!src) return;
  if (mediaKind(item) === 'video') {
    window.open(src, '_blank');
    return;
  }
  try {
    const viewerUrl = new URL('image-viewer.html', window.location.href);
    viewerUrl.searchParams.set('src', src);
    if (caption) viewerUrl.searchParams.set('caption', caption);

    const sw = window.screen?.availWidth || window.innerWidth || 1400;
    const sh = window.screen?.availHeight || window.innerHeight || 900;
    const width = Math.max(960, Math.floor(sw * 0.9));
    const height = Math.max(640, Math.floor(sh * 0.9));
    const left = Math.max(0, Math.floor((sw - width) / 2));
    const top = Math.max(0, Math.floor((sh - height) / 2));
    const features = `resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no,width=${width},height=${height},left=${left},top=${top}`;
    const win = window.open(viewerUrl.toString(), '_blank', features);
    if (win) {
      try { win.focus(); } catch {}
      return;
    }
  } catch {}
  window.open(src, '_blank');
}

function applyResponsiveScale() {
  const shell = refs?.shell;
  if (!shell) return;
  const designW = 1080;
  const designH = 700;
  const padW = 8;
  const padH = 8;
  const usableW = Math.max(320, window.innerWidth - padW);
  const usableH = Math.max(280, window.innerHeight - padH);
  const ratio = Math.min(usableW / designW, usableH / designH);
  const scale = Math.max(0.7, Math.min(ratio, 1.55));
  shell.style.setProperty('--oeuvre-scale', scale.toFixed(3));

  const isStacked = window.innerWidth <= 760;
  if (isStacked) {
    const shellStyles = window.getComputedStyle(shell);
    const padTop = parseFloat(shellStyles.paddingTop) || 0;
    const padBottom = parseFloat(shellStyles.paddingBottom) || 0;
    const headH = refs.head?.getBoundingClientRect().height || 0;
    const gap = 10;
    const available = Math.max(120, window.innerHeight - headH - padTop - padBottom - 16);
    const minStage = 96;
    const maxStage = 260;
    const minMeta = 64;
    const maxMeta = 150;
    const minTotal = minStage + minMeta + gap;

    let stage;
    let meta;

    if (available <= minTotal) {
      const ratio = available / minTotal;
      stage = minStage * ratio;
      meta = minMeta * ratio;
    } else {
      stage = Math.max(minStage, Math.min(available * 0.66, maxStage));
      meta = Math.max(minMeta, Math.min(available - stage - gap, maxMeta));
      const overflow = stage + meta + gap - available;
      if (overflow > 0) {
        stage = Math.max(minStage, stage - overflow);
      }
    }

    shell.style.setProperty('--stack-stage-h', `${Math.round(stage)}px`);
    shell.style.setProperty('--stack-meta-h', `${Math.round(meta)}px`);
  } else {
    const panel = Math.max(280, Math.min(usableH * 0.62, 560));
    shell.style.setProperty('--panel-h', `${Math.round(panel)}px`);
  }
}

function thumbWindowIndices(count, current, windowSize = 5) {
  if (count <= windowSize) return Array.from({ length: count }, (_, i) => i);
  const half = Math.floor(windowSize / 2);
  let start = current - half;
  start = Math.max(0, Math.min(start, count - windowSize));
  return Array.from({ length: windowSize }, (_, i) => start + i);
}

function renderThumbs() {
  const { thumbs } = refs;
  if (!thumbs) return;
  thumbs.innerHTML = '';
  const indices = thumbWindowIndices(items.length, activeIndex, 5);
  const frag = document.createDocumentFragment();

  indices.forEach((idx) => {
    const item = items[idx];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oeuvre-thumb';
    if (idx === activeIndex) btn.classList.add('is-active');
    btn.setAttribute('aria-label', `Open selection ${idx + 1}`);

    if (mediaKind(item) === 'video') {
      const vid = document.createElement('video');
      vid.src = encodeURI(item.src);
      vid.muted = true;
      vid.preload = 'metadata';
      vid.playsInline = true;
      vid.setAttribute('aria-hidden', 'true');
      btn.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = encodeURI(item.src);
      img.alt = item.alt || '';
      btn.appendChild(img);
    }

    btn.addEventListener('click', () => {
      activeIndex = idx;
      render();
    });

    frag.appendChild(btn);
  });

  thumbs.appendChild(frag);
}

function renderMeta(item) {
  const title = titleFromItem(item);
  const type = formatType(item);

  if (refs.metaTitle) {
    refs.metaTitle.innerHTML = `<span class="meta-label">title:</span> <span class="meta-value">${escapeHtml(title)}</span>`;
  }
  if (refs.metaType) {
    refs.metaType.innerHTML = `<span class="meta-label">type:</span> ${escapeHtml(type)}`;
  }
}

function render() {
  if (!items.length) return;
  const item = items[activeIndex];
  refs.counter && (refs.counter.textContent = `${activeIndex + 1} of ${items.length}`);
  const kind = mediaKind(item);
  if (refs.video) refs.video.pause();
  if (kind === 'video') {
    if (refs.image) refs.image.style.display = 'none';
    if (refs.video) {
      refs.video.style.display = 'block';
      refs.video.controls = true;
      refs.video.src = encodeURI(item.src);
      refs.video.setAttribute('aria-label', item.alt || titleFromItem(item));
      refs.video.load();
    }
  } else {
    if (refs.video) {
      refs.video.controls = false;
      refs.video.style.display = 'none';
      refs.video.removeAttribute('src');
      refs.video.load();
    }
    if (refs.image) {
      refs.image.style.display = 'block';
      refs.image.src = encodeURI(item.src);
      refs.image.alt = item.alt || titleFromItem(item);
    }
  }
  renderMeta(item);
  renderThumbs();
}

function bindControls() {
  if (controlsBound) return;
  controlsBound = true;

  refs.prev?.addEventListener('click', () => {
    activeIndex = clampIndex(activeIndex - 1);
    render();
  });

  refs.next?.addEventListener('click', () => {
    activeIndex = clampIndex(activeIndex + 1);
    render();
  });

  refs.image?.addEventListener('click', () => {
    const item = items[activeIndex];
    if (!item) return;
    if (mediaKind(item) !== 'image') return;
    openLargeWindow(item);
  });

  window.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      activeIndex = clampIndex(activeIndex - 1);
      render();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      activeIndex = clampIndex(activeIndex + 1);
      render();
    }
  });

  window.addEventListener('resize', applyResponsiveScale);
}

function fetchWithTimeout(resource, options = {}) {
  const { timeout = 10000, ...rest } = options;
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    fetch(resource, { ...rest, signal: controller.signal })
      .then((r) => {
        clearTimeout(id);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

async function loadItems() {
  let text = null;
  let lastErr = null;

  for (const url of DATA_URLS) {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-cache', timeout: 12000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (text == null) {
    throw lastErr || new Error('Could not load gallery.json');
  }

  const parsed = JSON.parse(stripTrailingCommas(text));
  if (!Array.isArray(parsed)) return { items: [], lastUpdated: null };

  const lastUpdated = parsed.reduce((latest, item) => {
    const value = item?.dateAdded;
    if (!value) return latest;
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return latest;
    if (latest == null || ts > latest) return ts;
    return latest;
  }, null);

  return {
    items: parsed.filter(isRenderableMedia),
    lastUpdated: lastUpdated == null ? null : new Date(lastUpdated).toISOString()
  };
}

async function initGallery(base = document) {
  refs = getRefs(base);
  controlsBound = false;
  applyResponsiveScale();
  try {
    const loaded = await loadItems();
    items = loaded.items;
    if (refs.updated) refs.updated.textContent = formatUpdatedDate(loaded.lastUpdated);
    if (!items.length) {
      refs.counter && (refs.counter.textContent = '0 of 0');
      return;
    }

    activeIndex = 0;
    bindControls();
    render();
  } catch (err) {
    if (refs.updated) refs.updated.textContent = 'unknown';
    refs.counter && (refs.counter.textContent = '0 of 0');
    console.error('[gallery] init error', err);
  }
}

if (document.readyState !== 'loading') initGallery();
else document.addEventListener('DOMContentLoaded', initGallery);

if (typeof window !== 'undefined') {
  window.initGallery = initGallery;
}

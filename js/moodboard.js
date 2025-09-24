// js/moodboard.js
(() => {
  const CONTAINER_ID = 'masonry';
  const JSON_CANDIDATES = ['moodboard.json', 'data/moodboard.json'];

  // ---- helpers ---------------------------------------------------
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

  // ---- DOM builders ----------------------------------------------
  function createTile(item) {
    const fig = document.createElement('figure');
    fig.className = 'mood-tile';

    if (isLikelyVideo(item)) {
      const video = document.createElement('video');
      video.className = 'mood-video';
      video.playsInline = true;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.controls = true; // set to false if you want no UI

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

      // Fallback text
      video.appendChild(
        document.createTextNode(
          'Your browser does not support the provided video formats.'
        )
      );

      fig.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.className = 'mood-img';
      img.src = encodeURI(item.src);
      img.alt = item.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('click', () => openLightbox(img.src, item.caption || ''));
      fig.appendChild(img);
    }

    if (item.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = item.caption;
      fig.appendChild(cap);
    }

    return fig;
  }

  // ---- lazy play/pause videos -----------------------------------
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

  // ---- lightbox (images only) -----------------------------------
  function openLightbox(src, caption) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lbImg');
    const lbCap = document.getElementById('lbCap');
    if (!lb || !lbImg || !lbCap) return;

    lbImg.src = src;
    lbCap.textContent = caption || '';
    lb.hidden = false;

    const onEsc = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
    document.addEventListener('keydown', onEsc, { once: true });

    // close handlers
    lb.addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') closeLightbox();
    });
    document.querySelector('.lb-close')?.addEventListener('click', closeLightbox, { once: true });

    function closeLightbox() {
      lb.hidden = true;
      lbImg.src = '';
    }
  }

  // ---- boot ------------------------------------------------------
  async function loadMoodboard() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.warn('[moodboard] container not found:', CONTAINER_ID);
      return;
    }
    container.innerHTML = '<div style="padding:12px;opacity:.6">Loading…</div>';

    let text = null, lastErr = null, urlUsed = null;
    for (const url of JSON_CANDIDATES) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
        urlUsed = url;
        break;
      } catch (e) { lastErr = e; }
    }
    if (text == null) {
      container.innerHTML = '<div style="padding:12px;color:#000"><b>Could not load moodboard.json</b></div>';
      console.error('[moodboard] fetch failed:', lastErr);
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

    // Normalize: if entry looks like a video but has no sources, create one.
    items = items.map((it) =>
      isLikelyVideo(it) && !it.sources
        ? { ...it, type: 'video', sources: [{ src: it.src, type: guessMime(it.src) || undefined }] }
        : it
    );

    const frag = document.createDocumentFragment();
    items.forEach((it) => frag.appendChild(createTile(it)));
    container.innerHTML = '';
    container.appendChild(frag);
    setupVideoAutoplay(container);

    console.log(`[moodboard] loaded ${items.length} items from ${urlUsed}`);
  }

  document.addEventListener('DOMContentLoaded', loadMoodboard);
})();

// Builds a live-text/SVG menu from JSON with robust logging.
export async function loadMenu({ container, dataUrl }) {
  container.innerHTML = '<div style="color:#000;opacity:.6;padding:8px">Loading menu…</div>';

  let items;
  try {
    console.log('[menu] fetching', dataUrl);
    const res = await fetch(dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    const raw = await res.text();
    try { items = JSON.parse(raw); }
    catch (e) { console.error('[menu] JSON parse error. Raw text:\n', raw); throw e; }
  } catch (err) {
    console.error('[menu] FAILED to load menu JSON:', err);
    container.innerHTML = '<div style="color:#000;padding:12px"><b>Menu failed to load.</b><br/><small>See console for details.</small></div>';
    return;
  }

  container.innerHTML = '';
  let rendered = 0;

  for (const [i, item] of items.entries()) {
    try {
      const a = document.createElement('a');
      a.className = 'menu-item';
      if (item.class) a.classList.add(item.class);     // e.g., "svg"
      a.href = item.href || '#';
      a.style.left = (item.x ?? 50) + '%';
      a.style.top  = (item.y ?? 50) + '%';
      if (item.color) a.style.color = item.color;
      if (item.size && !item.svg) a.style.fontSize = item.size; // text sizing
      if (item.fontWeight) a.style.fontWeight = item.fontWeight;
      if (item.target === '_blank') a.target = '_blank';
      if (item.rel) a.rel = item.rel;
      if (item.title) a.title = item.title;

      const aria = item.ariaLabel || item.label || item.title || '';
      if (aria) a.setAttribute('aria-label', aria);

      if (item.svg) {
        // Inline SVG icon
        a.classList.add('svg');
        const svgEl = await fetchInlineSVG(item.svg);
        if (!svgEl) { console.warn(`[menu] item ${i}: SVG failed: ${item.svg}`); continue; }
        // Size via iconSize or size (width)
        if (item.iconSize) svgEl.style.width = item.iconSize;
        else if (item.size) svgEl.style.width = item.size;
        a.appendChild(svgEl);
      } else if (item.label != null) {
        a.textContent = item.label;
      } else {
        console.warn(`[menu] item ${i}: no "label" or "svg"; skipping`);
        continue;
      }

      container.appendChild(a);
      rendered++;
    } catch (e) {
      console.error(`[menu] item ${i} render error`, item, e);
    }
  }

  if (rendered === 0) {
    container.innerHTML = '<div style="color:#000;padding:12px"><b>Menu failed to load.</b><br/><small>No valid items rendered. Check console.</small></div>';
  } else {
    console.log(`[menu] rendered ${rendered} item(s)`);
  }
}

async function fetchInlineSVG(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) { console.warn('[menu] SVG HTTP error', r.status, url); return null; }
    let txt = await r.text();
    // strip scripts
    txt = txt.replace(/<script[\s\S]*?<\/script>/gi, '');
    const tpl = document.createElement('template');
    tpl.innerHTML = txt.trim();
    const el = tpl.content.firstElementChild;
    if (!el || el.tagName.toLowerCase() !== 'svg') { console.warn('[menu] Not an <svg> root:', url); return null; }
    // let CSS control sizing; keep viewBox
    el.removeAttribute('width'); el.removeAttribute('height');
    // encourage inheriting color
    if (!el.getAttribute('fill')) el.setAttribute('fill', 'currentColor');
    return el;
  } catch (e) {
    console.error('[menu] fetchInlineSVG failed for', url, e);
    return null;
  }
}

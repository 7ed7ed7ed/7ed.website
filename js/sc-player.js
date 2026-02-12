// sc-player.js – floating icon SoundCloud controller

const JSON_URL = 'data/playlist-soundcloud.json';
const IS_POPUP = (() => { try { return new URLSearchParams(location.search).get('popup') === '1'; } catch { return false; }})();

// In popup windows, do not initialize the global player UI or SoundCloud widget.
if (IS_POPUP) {
  window.SC_MBAR = { cue() {}, play() {}, pause() {}, next() {}, prev() {}, exit() {} };
}

const ORB           = document.getElementById('player-orb');
const CORE_BTN      = document.getElementById('orb-core');
const PREV_BTN      = document.getElementById('orb-prev');
const NEXT_BTN      = document.getElementById('orb-next');
const EXIT_BTN      = document.getElementById('orb-exit');
const STAR_BTNS     = Array.from(document.querySelectorAll('.orb-star'));
const TRACK_WRAP    = document.querySelector('.orb-track');
const TRACK_TEXT    = document.getElementById('orb-track-text');
const WIDGET_IFRAME = document.getElementById('sc-widget');
const INTRO_VIDEO   = document.getElementById('introVideo');

const ORB_POS_KEY     = 'playerOrbPos:v1';
const ORB_DEFAULT_KEY = 'playerOrbDefaultPos:v1';
const STATE_KEY   = 'scPlayerState:v2';
const DEFAULT_VOLUME = 10;

let SCWidget        = null;
let playlist        = [];
let playlistOrder   = [];
let cursor          = 0;              // position within playlistOrder
let index           = 0;              // actual playlist index currently loaded
let isReady         = false;
let isPlaying       = false;
let pendingAction   = null;
let phase           = 'gods';
let dragState       = null;
let suppressClick   = false;
let positionMs      = 0;
let pendingSeekMs   = 0;
let marqueeNeedsRestart = false;
let orbDevPanel = null;
let volumeLockTimer = null;

// ---------- helpers ----------
function widgetSrc(scUrl, autoPlay = false) {
  const params = new URLSearchParams({
    url: scUrl,
    auto_play: autoPlay ? 'true' : 'false',
    hide_related: 'true',
    visual: 'false',
    buying: 'false',
    liking: 'false',
    download: 'false',
    sharing: 'false',
    show_comments: 'false',
    show_playcount: 'false',
    show_user: 'false'
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}

async function fetchPlaylist() {
  const res = await fetch(JSON_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Playlist HTTP ${res.status}`);
  return res.json();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildOrder(startIndex = 0) {
  const length = playlist.length;
  if (length === 0) {
    playlistOrder = [];
    cursor = 0;
    return;
  }
  const indices = Array.from({ length }, (_, i) => i);
  indices.splice(startIndex, 1);
  shuffleArray(indices);
  indices.unshift(startIndex);
  playlistOrder = indices;
  cursor = 0;
  saveState();
}

function currentTrackIndex() {
  return playlistOrder[cursor] ?? 0;
}

function loadTrackByIndex(trackIndex, { autoplay = false, position = 0 } = {}) {
  if (!playlist[trackIndex]) return;
  index = trackIndex;
  const track = playlist[trackIndex];
  setTrackTitle(track?.title || track?.url || '—');
  pendingSeekMs = Math.max(0, position || 0);
  positionMs = pendingSeekMs;
  initWidget(playlist[trackIndex].url, autoplay);
  saveState();
}

function playCursorPosition(pos, { autoplay = true } = {}) {
  if (!playlistOrder.length) return;
  const length = playlistOrder.length;
  cursor = ((pos % length) + length) % length; // clamp + wrap
  const nextIndex = playlistOrder[cursor];
  loadTrackByIndex(nextIndex, { autoplay, position: 0 });
}

function goNext({ autoplay = true } = {}) {
  playCursorPosition(cursor + 1, { autoplay });
}

function goPrev({ autoplay = true } = {}) {
  playCursorPosition(cursor - 1, { autoplay });
}

function computeMode() {
  return isPlaying ? 'playgods' : 'gods';
}

function modeLabel(mode) {
  switch (mode) {
    case 'playstars':
    case 'playgods':
      return 'Pause music';
    case 'stars':
    case 'gods':
      return 'Play music';
    default: return 'Play music';
  }
}

function syncVisualState() {
  if (!ORB) return;
  const mode = computeMode();
  ORB.setAttribute('data-phase', phase);
  ORB.setAttribute('data-mode', mode);
  ORB.setAttribute('data-playing', isPlaying ? '1' : '0');
  if (CORE_BTN) CORE_BTN.setAttribute('aria-label', modeLabel(mode));
  refreshTrackMarquee();
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function measureBounds() {
  const width  = ORB?.offsetWidth || 0;
  const height = ORB?.offsetHeight || 0;
  const margin = 8;
  return {
    minX: margin * -0.5,
    minY: margin * -0.5,
    maxX: Math.max(margin, (window.innerWidth  || 0) - width  - margin * 0.5),
    maxY: Math.max(margin, (window.innerHeight || 0) - height - margin * 0.5)
  };
}

function setOrbPosition(left, top, { save = false } = {}) {
  if (!ORB) return;
  const bounds = measureBounds();
  const clampedLeft = clamp(left, bounds.minX, bounds.maxX);
  const clampedTop  = clamp(top, bounds.minY, bounds.maxY);
  ORB.style.setProperty('--orb-left', `${clampedLeft}px`);
  ORB.style.setProperty('--orb-top', `${clampedTop}px`);
  orbDevPanel?.__updateOrbPosition?.();
  if (save) {
    try { localStorage.setItem(ORB_POS_KEY, JSON.stringify({ left: clampedLeft, top: clampedTop })); } catch {}
  }
}

function saveDefaultPosition(left, top) {
  try { localStorage.setItem(ORB_DEFAULT_KEY, JSON.stringify({ left, top })); } catch {}
}

function loadDefaultPosition() {
  try {
    const raw = localStorage.getItem(ORB_DEFAULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(extra = {}) {
  const state = {
    index,
    cursor,
    playlistOrder: Array.from(playlistOrder),
    isPlaying,
    phase,
    positionMs,
    ...extra
  };
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function restoreState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setTrackTitle(raw) {
  if (!TRACK_TEXT) return;
  const text = (raw && String(raw).trim()) || '—';
  TRACK_TEXT.textContent = text.toLowerCase();
  marqueeNeedsRestart = true;
  refreshTrackMarquee();
}

function refreshTrackMarquee() {
  if (!TRACK_WRAP || !TRACK_TEXT || !TRACK_WRAP.isConnected) return;

  // Always run marquee when shown; pause is controlled via CSS when not playing.
  TRACK_WRAP.setAttribute('data-scroll', 'marquee');

  if (marqueeNeedsRestart) {
    TRACK_TEXT.style.animation = 'none';
    void TRACK_TEXT.offsetWidth; // reflow to restart
    TRACK_TEXT.style.animation = '';
    marqueeNeedsRestart = false;
  }
}

function applyPendingSeek() {
  if (!SCWidget || !pendingSeekMs) return;
  const target = Math.max(0, pendingSeekMs);
  try { SCWidget.seekTo(target); } catch {}
  pendingSeekMs = 0;
}

function applyVolume() {
  if (!SCWidget) return;
  try { SCWidget.setVolume(DEFAULT_VOLUME); } catch {}
}

function startVolumeLock() {
  if (volumeLockTimer) return;
  applyVolume();
  volumeLockTimer = setInterval(() => {
    applyVolume();
  }, 1000);
}

function stopVolumeLock() {
  if (!volumeLockTimer) return;
  clearInterval(volumeLockTimer);
  volumeLockTimer = null;
}

function restoreOrbPosition() {
  if (!ORB) return;
  try {
    const raw = localStorage.getItem(ORB_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
        setOrbPosition(parsed.left, parsed.top, { save: false });
        return;
      }
    }
    const def = loadDefaultPosition();
    if (def && typeof def.left === 'number' && typeof def.top === 'number') {
      setOrbPosition(def.left, def.top, { save: false });
    }
  } catch {}
}

function resetToDefaultPosition() {
  const def = loadDefaultPosition();
  if (def && typeof def.left === 'number' && typeof def.top === 'number') {
    setOrbPosition(def.left, def.top, { save: true });
  }
}

function clampOrbToViewport() {
  if (!ORB) return;
  // Skip clamping if the orb is hidden (rect will be 0,0 and would wrongly save top-left)
  try {
    if (ORB.hasAttribute('hidden') || getComputedStyle(ORB).display === 'none') return;
  } catch {}
  const rect = ORB.getBoundingClientRect();
  // If not laid out yet, bail (prevents saving 0,0)
  if (!rect || rect.width === 0 || rect.height === 0) return;
  setOrbPosition(rect.left, rect.top, { save: true });
}

function ensureGodsPhase() {
  if (phase !== 'gods') {
    phase = 'gods';
    syncVisualState();
    saveState();
  }
  clampOrbToViewport();
}

function exitToStars() {
  phase = 'gods';
  updatePlayingState(false);
  syncVisualState();
  clampOrbToViewport();
}

function updatePlayingState(nextState) {
  if (isPlaying === nextState) return;
  isPlaying = nextState;
  syncVisualState();
  saveState();
}

function requestPlay() {
  if (!SCWidget || !isReady) {
    pendingAction = 'play';
    return;
  }
  pendingAction = null;
  applyVolume();
  try { SCWidget.play(); } catch {}
}

function requestPause() {
  if (!SCWidget || !isReady) {
    pendingAction = 'pause';
    return;
  }
  pendingAction = null;
  try { SCWidget.pause(); } catch {}
}

function handleCoreClick() {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (isPlaying) {
    updatePlayingState(false);
    requestPause();
  } else {
    updatePlayingState(true);
    requestPlay();
  }
}

function handleOrbitClick(direction) {
  const autoplay = isPlaying;
  ensureGodsPhase();
  if (direction === 'prev') goPrev({ autoplay });
  else goNext({ autoplay });
}

function handleStarClick(e) {
  ensureGodsPhase();
  e.preventDefault();
  e.stopPropagation();
}

function onPointerDown(e) {
  if (!ORB || e.button !== 0) return;
  if (e.target.closest('.orb-star, .orb-hotspot, #orb-exit')) return;
  const rect = ORB.getBoundingClientRect();
  dragState = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    moved: false
  };
}

function onPointerMove(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 3) {
    dragState.moved = true;
    try { ORB.setPointerCapture(e.pointerId); } catch {}
  }
  if (!dragState.moved) return;
  const bounds = measureBounds();
  const nextLeft = clamp(dragState.startLeft + dx, bounds.minX, bounds.maxX);
  const nextTop  = clamp(dragState.startTop  + dy, bounds.minY, bounds.maxY);
  setOrbPosition(nextLeft, nextTop);
  e.preventDefault();
}

function onPointerUp(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  if (dragState.moved) {
    const bounds = measureBounds();
    const nextLeft = clamp(dragState.startLeft + (e.clientX - dragState.startX), bounds.minX, bounds.maxX);
    const nextTop  = clamp(dragState.startTop  + (e.clientY - dragState.startY), bounds.minY, bounds.maxY);
    setOrbPosition(nextLeft, nextTop, { save: true });
    suppressClick = true;
    e.preventDefault();
    e.stopPropagation();
  }
  try { ORB.releasePointerCapture(e.pointerId); } catch {}
  dragState = null;
  if (suppressClick) {
    setTimeout(() => { suppressClick = false; }, 60);
  }
}

// ---------- widget wiring ----------
function initWidget(url, autoPlay = false) {
  if (!WIDGET_IFRAME) return;
  isReady = false;
  if (autoPlay) pendingAction = 'play';
  else if (pendingAction !== 'pause') pendingAction = null;

  WIDGET_IFRAME.src = widgetSrc(url, autoPlay);
  setTimeout(() => {
    SCWidget = window.SC?.Widget?.(WIDGET_IFRAME) || null;
    bindWidgetEvents();
    setTimeout(() => applyVolume(), 150);
  }, 0);
}

function bindWidgetEvents() {
  if (!SCWidget || !window.SC?.Widget?.Events) return;
  const Events = window.SC.Widget.Events;

  SCWidget.unbind?.(Events.READY);
  SCWidget.unbind?.(Events.PLAY);
  SCWidget.unbind?.(Events.PAUSE);
  SCWidget.unbind?.(Events.FINISH);

  SCWidget.bind(Events.READY, () => {
    isReady = true;
    applyVolume();
    if (pendingAction === 'play') {
      pendingAction = null;
      SCWidget.play();
    } else if (pendingAction === 'pause') {
      pendingAction = null;
      SCWidget.pause();
    }
    SCWidget.getCurrentSound((sound) => {
      if (sound?.title) setTrackTitle(sound.title);
    });
    applyPendingSeek();
  });

  SCWidget.bind(Events.PLAY, () => {
    updatePlayingState(true);
    applyVolume();
    startVolumeLock();
    SCWidget.getCurrentSound((sound) => {
      if (sound?.title) setTrackTitle(sound.title);
    });
    applyPendingSeek();
  });

  SCWidget.bind(Events.PAUSE, () => {
    updatePlayingState(false);
    stopVolumeLock();
  });

  SCWidget.bind(Events.FINISH, () => {
    stopVolumeLock();
    goNext({ autoplay: true });
  });

  SCWidget.bind(Events.PLAY_PROGRESS, (e) => {
    if (typeof e?.currentPosition === 'number') {
      positionMs = e.currentPosition;
    }
    applyVolume();
  });
}

function wireUI() {
  CORE_BTN?.addEventListener('click', handleCoreClick);
  PREV_BTN?.addEventListener('click', () => handleOrbitClick('prev'));
  NEXT_BTN?.addEventListener('click', () => handleOrbitClick('next'));
  EXIT_BTN?.addEventListener('click', exitToStars);
  STAR_BTNS.forEach((btn) => btn.addEventListener('click', handleStarClick));

  if (ORB) {
    ORB.addEventListener('pointerdown', onPointerDown);
    ORB.addEventListener('pointermove', onPointerMove);
    ORB.addEventListener('pointerup', onPointerUp);
    ORB.addEventListener('pointercancel', onPointerUp);
    ORB.addEventListener('click', (ev) => {
      if (suppressClick) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }, true);
  }

  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;

    if (e.key === ' ') {
      e.preventDefault();
      handleCoreClick();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleOrbitClick('prev');
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleOrbitClick('next');
    }
    if (e.key === 'Escape') {
      exitToStars();
    }
    // Save current orb position as default: Ctrl/Cmd+Shift+S
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      const rect = ORB.getBoundingClientRect();
      saveDefaultPosition(rect.left, rect.top);
      e.preventDefault();
    }
    // Reset position to default: Ctrl/Cmd+Shift+R
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
      resetToDefaultPosition();
      e.preventDefault();
    }
  });

  window.addEventListener('resize', () => {
    clampOrbToViewport();
    refreshTrackMarquee();
  });
  window.addEventListener('orientationchange', refreshTrackMarquee);

  window.addEventListener('pagehide', () => {
    saveState();
  });
}

function setupOrbDevPanel() {
  if (!ORB) return;
  if (orbDevPanel) return;
  const panel = document.createElement('div');
  panel.id = 'orb-dev-panel';
  panel.innerHTML = `
    <div class="orb-dev__header" data-drag-handle>Orb tools</div>
    <div class="orb-dev__group">
      <label class="orb-dev__label" for="orb-scale-range">Orb scale</label>
      <input id="orb-scale-range" class="orb-dev__range" type="range" min="0.5" max="1.6" step="0.01" />
      <input id="orb-scale-value" class="orb-dev__value" type="number" min="0.5" max="1.6" step="0.01" />
    </div>
    <div class="orb-dev__divider" aria-hidden="true"></div>
    <div class="orb-dev__group">
      <label class="orb-dev__label" for="orb-pos-step">Position step (px)</label>
      <input id="orb-pos-step" class="orb-dev__value" type="number" min="1" max="50" step="1" value="4" />
      <div class="orb-dev__pos-grid">
        <button type="button" class="orb-dev__btn" data-nudge="up" aria-label="Move up">↑</button>
        <div class="orb-dev__pos-row">
          <button type="button" class="orb-dev__btn" data-nudge="left" aria-label="Move left">←</button>
          <button type="button" class="orb-dev__btn" data-nudge="right" aria-label="Move right">→</button>
        </div>
        <button type="button" class="orb-dev__btn" data-nudge="down" aria-label="Move down">↓</button>
      </div>
      <div class="orb-dev__pos-values">
        <div>
          <label class="orb-dev__label" for="orb-pos-x">Left (px)</label>
          <input id="orb-pos-x" class="orb-dev__output" type="text" readonly />
        </div>
        <div>
          <label class="orb-dev__label" for="orb-pos-y">Top (px)</label>
          <input id="orb-pos-y" class="orb-dev__output" type="text" readonly />
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const range = panel.querySelector('#orb-scale-range');
  const valueInput = panel.querySelector('#orb-scale-value');
  const posStep = panel.querySelector('#orb-pos-step');
  const posX = panel.querySelector('#orb-pos-x');
  const posY = panel.querySelector('#orb-pos-y');
  const dragHandle = panel.querySelector('[data-drag-handle]');

  const readOrbScale = () => {
    const raw = getComputedStyle(ORB).getPropertyValue('--orb-user-scale');
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 1;
  };

  const setOrbScale = (value) => {
    const next = Number.isFinite(value) ? value : 1;
    ORB.style.setProperty('--orb-user-scale', String(next));
  };

  const updateOrbPosition = () => {
    const rawLeft = getComputedStyle(ORB).getPropertyValue('--orb-left');
    const rawTop = getComputedStyle(ORB).getPropertyValue('--orb-top');
    const left = parseFloat(rawLeft);
    const top = parseFloat(rawTop);
    posX.value = Number.isFinite(left) ? left.toFixed(2) : '0.00';
    posY.value = Number.isFinite(top) ? top.toFixed(2) : '0.00';
  };

  const syncScale = (value) => {
    range.value = value;
    valueInput.value = value;
  };

  const initial = readOrbScale().toFixed(2);
  syncScale(initial);
  updateOrbPosition();

  const restorePanelPosition = () => {
    try {
      const raw = localStorage.getItem('orbPanelPos:v1');
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
        localStorage.setItem('orbPanelPos:v1', JSON.stringify({ left: rect.left, top: rect.top }));
      } catch {}
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  enablePanelDrag();

  range.addEventListener('input', () => {
    const next = parseFloat(range.value);
    setOrbScale(next);
    valueInput.value = range.value;
  });

  valueInput.addEventListener('input', () => {
    const next = parseFloat(valueInput.value);
    if (!Number.isFinite(next)) return;
    setOrbScale(next);
    range.value = valueInput.value;
  });

  panel.querySelectorAll('[data-nudge]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = parseFloat(posStep.value) || 4;
      const rect = ORB.getBoundingClientRect();
      const dir = button.dataset.nudge;
      const nextLeft = dir === 'left' ? rect.left - step : dir === 'right' ? rect.left + step : rect.left;
      const nextTop = dir === 'up' ? rect.top - step : dir === 'down' ? rect.top + step : rect.top;
      setOrbPosition(nextLeft, nextTop, { save: true });
      updateOrbPosition();
    });
  });

  const syncVisibility = () => {
    const show = document.body?.classList.contains('dev');
    panel.hidden = !show;
  };
  const observer = new MutationObserver(syncVisibility);
  if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  syncVisibility();

  panel.__updateOrbPosition = updateOrbPosition;
  orbDevPanel = panel;
}

// ---------- boot flow ----------
async function boot() {
  try {
    playlist = await fetchPlaylist();
    if (!Array.isArray(playlist) || playlist.length === 0) return;
    const restored = restoreState();

    if (restored && Array.isArray(restored.playlistOrder) && restored.playlistOrder.length === playlist.length) {
      const validOrder = restored.playlistOrder.every((n) => Number.isInteger(n) && n >= 0 && n < playlist.length);
      if (validOrder) {
        playlistOrder = [...restored.playlistOrder];
        cursor = Math.min(Math.max(restored.cursor ?? 0, 0), playlistOrder.length - 1);
        index = playlistOrder[cursor] ?? 0;
        phase = 'gods';
        isPlaying = false;
        positionMs = Math.max(0, restored.positionMs ?? 0);
        pendingSeekMs = positionMs;
        syncVisualState();
        const hasWidgetSrc = WIDGET_IFRAME && WIDGET_IFRAME.src && !WIDGET_IFRAME.src.endsWith('about:blank');
        if (hasWidgetSrc) {
          SCWidget = window.SC?.Widget?.(WIDGET_IFRAME) || null;
          if (SCWidget) {
            bindWidgetEvents();
            applyPendingSeek();
            requestPause();
          }
        } else {
          loadTrackByIndex(index, { autoplay: false, position: positionMs });
        }
        saveState();
        return;
      }
    }

    const initialIndex = Math.floor(Math.random() * playlist.length);
    buildOrder(initialIndex);
    phase = 'gods';
    isPlaying = false;
    positionMs = 0;
    pendingSeekMs = 0;
    syncVisualState();
    loadTrackByIndex(currentTrackIndex(), { autoplay: false, position: 0 });
  } catch (e) {
    console.error('[sc-player] boot error', e);
  }
}

function initPlayerOnce() {
  if (!ORB) return;
  if (!ORB.hasAttribute('data-initialized')) {
    ORB.setAttribute('data-initialized', '1');
    phase = 'gods';
    updatePlayingState(false);
    syncVisualState();
    restoreOrbPosition();
    // Make the orb visible before measuring; clamp on next frame so layout is ready
    ORB.hidden = false;
    requestAnimationFrame(() => clampOrbToViewport());
    wireUI();
    setupOrbDevPanel();
    boot();
  }
}

const SHOULD_WAIT_FOR_INTRO = !!INTRO_VIDEO;
const INTRO_ALREADY_DONE = !!window.__INTRO_DONE__;

if (!IS_POPUP) {
  if (SHOULD_WAIT_FOR_INTRO && !INTRO_ALREADY_DONE) {
    document.addEventListener('intro:done', () => initPlayerOnce(), { once: true });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerOnce, { once: true });
  } else {
    initPlayerOnce();
  }
}

// ---------- public API ----------
window.SC_MBAR = {
  cue(i) {
    if (!playlist[i]) return;
    buildOrder(i);
    ensureGodsPhase();
    updatePlayingState(true);
    loadTrackByIndex(currentTrackIndex(), { autoplay: true });
  },
  play() {
    ensureGodsPhase();
    updatePlayingState(true);
    requestPlay();
  },
  pause() {
    updatePlayingState(false);
    requestPause();
  },
  next() {
    ensureGodsPhase();
    goNext({ autoplay: true });
  },
  prev() {
    ensureGodsPhase();
    goPrev({ autoplay: true });
  },
  exit() {
    exitToStars();
  },
  getState() {
    return {
      index,
      isPlaying,
      title: (TRACK_TEXT?.textContent || playlist[index]?.title || '').toString()
    };
  }
};

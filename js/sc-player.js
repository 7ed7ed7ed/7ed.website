// sc-player.js

// Use a relative path that matches your repo:
// /data/... would fail on file:// and some static hosts.
const JSON_URL = 'data/playlist-soundcloud.json';

const BAR          = document.getElementById('music-bar');
const WIDGET_IFRAME= document.getElementById('sc-widget');
const PLAY_BTN     = document.getElementById('mb-play');
const TITLE_EL     = document.getElementById('mb-track');
const PROG_EL      = document.getElementById('mb-progress');

const STATE_KEY = 'scPlayerState:v1';

let SCWidget   = null;
let playlist   = [];
let index      = 0;
let isReady    = false;
let isPlaying  = false;

// ---------------- utils ----------------
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

function saveState(extra = {}) {
  const state = {
    index,
    isPlaying,
    trackTitle: TITLE_EL?.textContent || '',
    ...extra
  };
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function restoreState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setTitle(text) {
  TITLE_EL.textContent = text || '—';
}

function setProgress(ratio) {
  const clamped = Math.max(0, Math.min(1, ratio || 0));
  PROG_EL.setAttribute('width', String(clamped * 100));
}

// -------------- widget wiring --------------
function initWidget(url, autoPlay=false) {
  WIDGET_IFRAME.src = widgetSrc(url, autoPlay);
  // Wrap after the iframe has a src
  setTimeout(() => {
    SCWidget = window.SC.Widget(WIDGET_IFRAME);
    bindWidgetEvents();
  }, 0);
}

function bindWidgetEvents() {
  if (!SCWidget) return;

  SCWidget.bind(window.SC.Widget.Events.READY, () => {
    isReady = true;
    SCWidget.getCurrentSound((sound) => {
      setTitle(sound ? sound.title : playlist[index]?.title || '');
    });
  });

  SCWidget.bind(window.SC.Widget.Events.PLAY, () => {
    isPlaying = true;
    PLAY_BTN.textContent = '❚❚';
    SCWidget.getCurrentSound((sound) => {
      setTitle(sound ? sound.title : playlist[index]?.title || '');
    });
    saveState();
  });

  SCWidget.bind(window.SC.Widget.Events.PAUSE, () => {
    isPlaying = false;
    PLAY_BTN.textContent = '►';
    saveState();
  });

  SCWidget.bind(window.SC.Widget.Events.FINISH, () => {
    next(); // auto-advance
  });

  SCWidget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (e) => {
    setProgress(e.relativePosition);
  });
}

function playPause() {
  if (!SCWidget || !isReady) return;
  SCWidget.isPaused((paused) => {
    if (paused) SCWidget.play();
    else SCWidget.pause();
  });
}

function loadAt(i, { autoplay = true } = {}) {
  index = (i + playlist.length) % playlist.length;
  setTitle(playlist[index]?.title || '—');
  initWidget(playlist[index].url, autoplay);
  saveState();
}

function next() { loadAt(index + 1, { autoplay: true }); }
function prev() { loadAt(index - 1, { autoplay: true }); }

function wireUI() {
  if (PLAY_BTN) PLAY_BTN.addEventListener('click', playPause);
  // Optional: keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); playPause(); }
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft')  prev();
  });
}

// -------------- boot flow --------------
async function boot() {
  try {
    playlist = await fetchPlaylist();
    if (!Array.isArray(playlist) || playlist.length === 0) {
      setTitle('No tracks found');
      return;
    }

    const restored = restoreState();
    if (restored && typeof restored.index === 'number' && playlist[restored.index]) {
      index = restored.index;
      setTitle(playlist[index].title);
      initWidget(playlist[index].url, false); // respect autoplay policies
    } else {
      loadAt(0, { autoplay: false });
    }
  } catch (e) {
    console.error('[sc-player] boot error', e);
    setTitle('Failed to load playlist');
  }
}

// Kickoff function (called immediately or after intro)
function initPlayerOnce() {
  if (!BAR) return;
  if (!BAR.hasAttribute('data-initialized')) {
    BAR.setAttribute('data-initialized', '1');
    BAR.hidden = false;     // reveal the bar now
    wireUI();
    boot();
  }
}

// If the body has the intro class, wait for intro:done; else init now
if (document.body.classList.contains('intro-dark')) {
  document.addEventListener('intro:done', initPlayerOnce, { once: true });
} else {
  initPlayerOnce();
}

// -------------- tiny public API for playlist page --------------
window.SC_MBAR = {
  cue(i) { loadAt(i, { autoplay: true }); },
  play() { playPause(); },
  next, prev
};

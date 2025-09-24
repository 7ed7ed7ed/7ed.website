import { loadMenu } from './menuLoader.js';

const body  = document.body;
const stage = document.getElementById('stage');
const video = document.getElementById('introVideo');
const menu  = document.getElementById('menu');

let hasStarted = false;   // first click starts with audio
let isRevealing = false;  // guard

// remember if we’ve already shown the intro recently (1 day)
const INTRO_KEY = 'introSeenAt';
const INTRO_TTL_MS = 24 * 60 * 60 * 1000;
const seenAt = Number(localStorage.getItem(INTRO_KEY) || 0);
const alreadySeen = seenAt && (Date.now() - seenAt) < INTRO_TTL_MS;

// Build the menu (hidden at first)
await loadMenu({ container: menu, dataUrl: './data/menuItems.json?v=' + Date.now() });

// If the intro was already seen, skip video immediately
if (alreadySeen) {
  body.classList.remove('intro-dark');
  body.classList.add('intro-light');
  menu.classList.add('show');
  if (video) video.classList.add('is-hidden'); // make sure video never blocks clicks
  syncMenuToCanvasBox();

  // 🔔 Tell the player to show/init even when skipping
  document.dispatchEvent(new Event('intro:done'));
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

  localStorage.setItem(INTRO_KEY, String(Date.now()));
  syncMenuToCanvasBox();

  // 🔔 notify the global player
  document.dispatchEvent(new Event('intro:done'));
}

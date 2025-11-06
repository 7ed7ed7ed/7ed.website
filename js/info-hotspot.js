// List every variant you want to cycle through
const VARIANTS = [
  "images/info/red-info(first).png",
  "images/info/red-info(two).png",
  "images/info/red-info(three).png",
  "images/info/red-info(four).png",
  "images/info/red-info(five).png",
  "images/info/red-info(six).png",
  "images/info/red-info(seven).png",
  "images/info/red-info(eight).png",
  "images/info/red-info(nine).png",
  "images/info/red-info(ten).png",
  "images/info/red-info(eleven).png",
  "images/info/red-info(twelve).png",
  "images/info/red-info(thriteen).png"
];

function initInfoHotspot(root = document) {
  const img = root.querySelector('#infoImage');
  const hotspot = root.querySelector('.theme-hotspot');
  if (!img || !hotspot) return;

  // keep hotspot above image
  img.style.zIndex = "1";
  hotspot.style.zIndex = "10";

  // preload for smooth swaps
  const cache = new Map();
  function preload(src) {
    if (cache.has(src)) return cache.get(src);
    const p = new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
    cache.set(src, p);
    return p;
  }
  VARIANTS.forEach(preload);

  const justName = p => (p || "").replace(/^.*[\\/]/, "");

  function pickNext() {
    const current = justName(img.getAttribute("src"));
    const options = VARIANTS.filter(v => justName(v) !== current);
    return options[Math.floor(Math.random() * options.length)] || VARIANTS[0];
  }

  async function swap() {
    const next = pickNext();
    try {
      await preload(next);
      img.style.opacity = "0";
      setTimeout(() => {
        img.src = encodeURI(next);
        requestAnimationFrame(() => (img.style.opacity = "1"));
      }, 60);
    } catch {
      img.src = encodeURI(next);
      img.style.opacity = "1";
    }
  }

  hotspot.addEventListener("click", swap);
  hotspot.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      swap();
    }
  });
}

if (document.readyState !== 'loading') initInfoHotspot();
else document.addEventListener('DOMContentLoaded', () => initInfoHotspot());

if (typeof window !== 'undefined') {
  window.initInfoHotspot = initInfoHotspot;
}

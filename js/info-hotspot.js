// List every variant you want to cycle through
const VARIANTS = [
  "images/info/red-info(pink).pdf",
  "images/info/red-info(blue).pdf",
  "images/info/red-info(yellow).pdf",
  "images/info/red-info(red).pdf",
  "images/info/red-info(green).pdf",
  "images/info/red-info(orange).pdf",
  "images/info/red-info(black).pdf",
  "images/info/red-info(white).pdf",
  "images/info/red-info(blackv2).pdf",
  "images/info/red-info(purple).pdf"
];
const PDF_PARAMS = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';

function initInfoHotspot(root = document) {
  const img = root.querySelector('#infoImage');
  const hotspot = root.querySelector('.theme-hotspot');
  if (!img || !hotspot) return;

  // keep hotspot above image
  img.style.zIndex = "1";
  hotspot.style.zIndex = "10";

  const justName = p => (p || "").replace(/^.*[\\/]/, "");
  const isObject = img.tagName.toLowerCase() === 'object';
  const getSource = () => isObject ? img.getAttribute('data') : img.getAttribute('src');
  const setSource = (value) => {
    const next = isObject ? value + PDF_PARAMS : value;
    if (isObject) img.setAttribute('data', next);
    else img.setAttribute('src', next);
  };

  function pickNext() {
    const current = justName(getSource());
    const options = VARIANTS.filter(v => justName(v) !== current);
    return options[Math.floor(Math.random() * options.length)] || VARIANTS[0];
  }

  async function swap() {
    const next = pickNext();
    img.style.opacity = "0";
    setTimeout(() => {
      setSource(encodeURI(next));
      requestAnimationFrame(() => (img.style.opacity = "1"));
    }, 60);
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

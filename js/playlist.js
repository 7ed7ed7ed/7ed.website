const GRID = document.getElementById("plGrid");
const DATA = "/data/playlist.json";

init();
async function init() {
  const items = await fetch(DATA, { cache: "no-cache" }).then(r => r.json()).catch(() => []);
  if (!items.length) {
    GRID.textContent = "No tracks found.";
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((it, i) => frag.appendChild(card(it, i)));
  GRID.appendChild(frag);
}

function card(it, i) {
  const c = document.createElement("article");
  c.className = "pl-card";

  // Thumbnail (YouTube default)
  const thumbUrl = `https://i.ytimg.com/vi/${it.youtube}/hqdefault.jpg`;

  const thumb = document.createElement("div");
  thumb.className = "pl-thumb";
  thumb.innerHTML = `<img src="${thumbUrl}" alt="">
                     <div class="pl-play">▶</div>`;
  thumb.addEventListener("click", () => loadIframe(thumb, it.youtube));

  const title = document.createElement("div");
  title.className = "pl-title";
  title.textContent = it.title;

  c.appendChild(thumb);
  c.appendChild(title);
  return c;
}

function loadIframe(thumb, videoId) {
  const iframe = document.createElement("iframe");
  iframe.width = "560";
  iframe.height = "315";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  iframe.style.width = "100%";
  iframe.style.aspectRatio = "16/9";
  thumb.replaceWith(iframe);
}

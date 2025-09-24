// tools/build-moodboard.js
// Build a data/moodboard.json listing from images/mood/*
// Features: width/height, newest-first, optional featured.txt, optional captions.json

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, extname, basename } from "path";
import { fileURLToPath } from "url";
import sizeOf from "image-size";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// CONFIG — adjust if your folders differ
const IMG_DIR   = join(__dirname, "..", "images", "moodboard");
const OUT_FILE  = join(__dirname, "..", "data", "moodboard.json");

// Optional helpers
const FEATURED  = join(IMG_DIR, "featured.txt");        // one filename per line
const CAPTIONS  = join(IMG_DIR, "captions.json");       // { "file.jpg": { "caption":"...", "alt":"..." } }

const ALLOWED = new Set([
  ".jpg",".jpeg",".png",".webp",".gif",".avif",
  ".mp4",".mov",".webm"   // add video formats
]);

// ---- read files ----
if (!existsSync(IMG_DIR)) {
  console.error(`[build-moodboard] Folder not found: ${IMG_DIR}`);
  process.exit(1);
}

let files = readdirSync(IMG_DIR).filter(f => ALLOWED.has(extname(f).toLowerCase()));

// newest-first by mtime
files.sort((a,b) => {
  const ma = statSync(join(IMG_DIR, a)).mtimeMs;
  const mb = statSync(join(IMG_DIR, b)).mtimeMs;
  return mb - ma;
});

// optional featured pinning (placed at the very top, preserving their order)
let featuredList = [];
if (existsSync(FEATURED)) {
  try {
    featuredList = readFileSync(FEATURED, "utf8")
      .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {}
}
if (featuredList.length) {
  const set = new Set(featuredList);
  const rest = files.filter(f => !set.has(f));
  files = [...featuredList.filter(f => files.includes(f)), ...rest];
}

// optional captions merge
let captions = {};
if (existsSync(CAPTIONS)) {
  try {
    captions = JSON.parse(readFileSync(CAPTIONS, "utf8"));
  } catch (e) {
    console.warn("[build-moodboard] captions.json parse error:", e.message);
  }
}

// build items
const items = files.map(name => {
  const abs = join(IMG_DIR, name);
  let width, height;
  try {
    const dim = sizeOf(abs);
    width = dim?.width; height = dim?.height;
  } catch {}
  const meta = captions[name] || {};
  return {
    src: `images/moodboard/${name}`,
    width, height,
    caption: meta.caption || "",
    alt: meta.alt || ""
    // You can also add "link": "https://..." to any entry in captions.json if you want tiles to open a site instead of the lightbox.
  };
});

// write output
const json = JSON.stringify(items, null, 2);
writeFileSync(OUT_FILE, json);
console.log(`[build-moodboard] wrote ${items.length} items → ${OUT_FILE}`);


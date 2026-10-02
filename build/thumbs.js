/* =========================================================
   KEYS99 - CARD THUMBNAILS

   Project photos are uploaded at full camera size (often 1-2 MB)
   but cards show them at about 400x300. For every card photo this
   writes a 640px-wide WebP to assets/thumbs/<hash>.webp, named by
   the homepage's own thumbName() so the live page can find it
   without a lookup. Existing thumbnails are kept, and ones no
   project uses any more are deleted.

   A photo that cannot be fetched or decoded is skipped with a
   warning: the card then falls back to the original photo, so a
   failure here never breaks the build or the page.
========================================================= */

const fs = require("fs");
const path = require("path");

const WIDTH = 640;
const QUALITY = 70;
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 30000;

async function download(url){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try{
    const res = await fetch(url, { signal: controller.signal });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const size = Number(res.headers.get("content-length") || 0);
    if(size > MAX_BYTES) throw new Error(`too large (${size} bytes)`);
    const body = Buffer.from(await res.arrayBuffer());
    if(body.length > MAX_BYTES) throw new Error(`too large (${body.length} bytes)`);
    return body;
  }finally{
    clearTimeout(timer);
  }
}

async function buildThumbs({ H, props, root }){
  let sharp;
  try{
    sharp = require("sharp");
  }catch(error){
    console.warn("  skipped  card thumbnails: sharp is not installed (cards will load the original photos)");
    return { made: 0, kept: 0, removed: 0, failed: 0 };
  }

  const dir = path.join(root, ...H.THUMB_DIR.split("/").filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });

  const wanted = new Map();
  props.forEach(p => {
    const url = H.getImageUrl(p);
    if(/^https?:\/\//i.test(url)) wanted.set(H.thumbName(url), url);
  });

  const stats = { made: 0, kept: 0, removed: 0, failed: 0 };

  for(const [name, url] of wanted){
    const file = path.join(dir, name);
    if(fs.existsSync(file)){
      stats.kept++;
      continue;
    }
    try{
      const input = await download(url);
      await sharp(input)
        .rotate()                                   // honour EXIF orientation from phones
        .resize({ width: WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(file);
      stats.made++;
      console.log(`  wrote    /${H.THUMB_DIR}${name}  (${Math.round(input.length / 1024)} KB -> ${Math.round(fs.statSync(file).size / 1024)} KB)`);
    }catch(error){
      stats.failed++;
      fs.rmSync(file, { force: true });
      console.warn(`  skipped  thumbnail for ${url}: ${error.message}`);
    }
  }

  fs.readdirSync(dir).forEach(name => {
    if(name.endsWith(".webp") && !wanted.has(name)){
      fs.rmSync(path.join(dir, name));
      stats.removed++;
      console.log(`  removed  /${H.THUMB_DIR}${name}`);
    }
  });

  return stats;
}

module.exports = { buildThumbs };

/* =========================================================
   KEYS99 - RESIZED IMAGES

   Project photos are uploaded at full camera size (often 1-2 MB).
   This writes WebP copies to assets/thumbs/, named by a hash of the
   original URL so the live pages can find them without a lookup:

     <hash>.webp        640px   cards (thumbName() in index.html)
     <hash>-1280.webp  1280px   project page main photo, lightbox,
                                floor plans and master plans
     <hash>-320.webp    320px   project page gallery strip
                                (thumbName() in js/project-core.js)

   Existing copies are kept, and ones nothing uses any more are
   deleted.

   A photo that cannot be fetched or decoded is skipped with a
   warning: the page then falls back to the original photo, so a
   failure here never breaks the build or the page.
========================================================= */

const fs = require("fs");
const path = require("path");

const CARD_WIDTH = 640;
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

/* Every copy the site links to: name -> { url, width, quality }. */
function plannedCopies({ H, P, props, rows, supabaseUrl }){
  const wanted = new Map();
  const add = (name, url, width, quality) => { if(!wanted.has(name)) wanted.set(name, { url, width, quality }); };
  const remote = url => /^https?:\/\//i.test(url || "");

  props.forEach(p => {
    const url = H.getImageUrl(p);
    if(remote(url)) add(H.thumbName(url), url, CARD_WIDTH, 70);
  });

  rows.forEach(row => {
    const p = P.normalizeProject(row, { supabaseUrl });
    p.images.filter(i => remote(i.url)).forEach(i => {
      add(P.thumbName(i.url, P.IMAGE_WIDTHS.large), i.url, P.IMAGE_WIDTHS.large, 72);
      add(P.thumbName(i.url, P.IMAGE_WIDTHS.small), i.url, P.IMAGE_WIDTHS.small, 65);
    });
    /* Plans carry small print, so they get a higher quality. */
    [...p.floorPlans, ...p.masterPlans].filter(f => remote(f.url)).forEach(f => {
      add(P.thumbName(f.url, P.IMAGE_WIDTHS.large), f.url, P.IMAGE_WIDTHS.large, 85);
    });
  });
  return wanted;
}

async function buildThumbs({ H, P, props, rows, supabaseUrl, root }){
  /* The page and the build must agree on file names. */
  const probe = "https://example.com/probe.jpg";
  if(H.thumbName(probe).slice(0, 8) !== P.thumbName(probe, 1).slice(0, 8) || H.THUMB_DIR !== P.THUMB_DIR){
    throw new Error("thumbName() in index.html and js/project-core.js no longer match");
  }

  let sharp;
  try{
    sharp = require("sharp");
  }catch(error){
    console.warn("  skipped  resized images: sharp is not installed (pages will load the original photos)");
    return { made: 0, kept: 0, removed: 0, failed: 0 };
  }

  const dir = path.join(root, ...H.THUMB_DIR.split("/").filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });

  const wanted = plannedCopies({ H, P, props, rows, supabaseUrl });

  const stats = { made: 0, kept: 0, removed: 0, failed: 0 };

  /* One download per photo, however many sizes it needs. */
  const byUrl = new Map();
  wanted.forEach((job, name) => {
    if(fs.existsSync(path.join(dir, name))){
      stats.kept++;
      return;
    }
    if(!byUrl.has(job.url)) byUrl.set(job.url, []);
    byUrl.get(job.url).push({ name, ...job });
  });

  for(const [url, jobs] of byUrl){
    let input;
    try{
      input = await download(url);
    }catch(error){
      stats.failed += jobs.length;
      console.warn(`  skipped  copies of ${url}: ${error.message}`);
      continue;
    }
    for(const { name, width, quality } of jobs){
      const file = path.join(dir, name);
      try{
        await sharp(input)
          .rotate()                                 // honour EXIF orientation from phones
          .resize({ width, withoutEnlargement: true })
          .webp({ quality })
          .toFile(file);
        stats.made++;
        console.log(`  wrote    /${H.THUMB_DIR}${name}  (${Math.round(input.length / 1024)} KB -> ${Math.round(fs.statSync(file).size / 1024)} KB)`);
      }catch(error){
        stats.failed++;
        fs.rmSync(file, { force: true });
        console.warn(`  skipped  ${name} for ${url}: ${error.message}`);
      }
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

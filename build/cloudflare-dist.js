/* =========================================================
   KEYS99 - CLOUDFLARE PAGES OUTPUT

   Cloudflare Pages build command:  npm run build:cloudflare
   Build output directory:          dist

   npm run build:cloudflare first runs build/generate.js, which
   writes every page from Supabase, then this script. It copies only
   the public website into dist/, so build scripts, SQL files,
   content sources and node_modules are never published, then adds
   Cloudflare's _headers and _redirects from cloudflare/.
========================================================= */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/* Everything a visitor can load. Anything not listed stays private. */
const PUBLIC = [
  "index.html", "404.html",
  "about.html", "contact.html", "home-loans.html", "privacy-policy.html", "terms.html",
  "saved.html", "reels.html",
  "favicon.ico", "robots.txt", "sitemap.xml",
  "assets", "css", "js", "projects", "developers", "admin"
];

const CLOUDFLARE_FILES = ["_headers", "_redirects"];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);

const missing = [];
PUBLIC.forEach(name => {
  const from = path.join(ROOT, name);
  if(!fs.existsSync(from)){ missing.push(name); return; }
  fs.cpSync(from, path.join(DIST, name), { recursive: true });
});
CLOUDFLARE_FILES.forEach(name => {
  fs.copyFileSync(path.join(ROOT, "cloudflare", name), path.join(DIST, name));
});

/* A missing page would deploy a site with dead links; stop instead. */
if(missing.length){
  console.error("Missing from the repository: " + missing.join(", "));
  process.exit(1);
}

let files = 0;
(function count(dir){
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e =>
    e.isDirectory() ? count(path.join(dir, e.name)) : files++);
})(DIST);
console.log(`dist/ ready: ${files} files`);

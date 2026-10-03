/* =========================================================
   KEYS99 - ASSET VERSIONS (cache busting)

   Every local stylesheet and script link in the built pages gets
   ?v=<hash of the file's contents>, e.g. css/index.css?v=3f2a9c1b.
   When a file changes its address changes, so browsers and
   GitHub Pages / Hostinger caches fetch the new copy at once
   instead of showing new HTML with old CSS or JS. Unchanged files
   keep their address and stay cached.
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* <link href="...css/x.css"> and <script src="...js/x.js">, local only. */
const ASSET_RE = /((?:href|src)=")((?!https?:|\/\/)[^"?#]*?\b(css|js)\/([A-Za-z0-9._-]+\.(?:css|js)))(?:\?v=[0-9a-f]*)?(")/g;

function stampAssetVersions(root, files){
  const hashes = new Map();
  const versionOf = (dir, name) => {
    const key = dir + "/" + name;
    if(!hashes.has(key)){
      const file = path.join(root, dir, name);
      hashes.set(key, fs.existsSync(file)
        ? crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8)
        : null);
    }
    return hashes.get(key);
  };

  let stamped = 0;
  files.forEach(file => {
    if(!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, "utf8");
    const out = html.replace(ASSET_RE, (match, open, url, dir, name, close) => {
      const v = versionOf(dir, name);
      return v ? `${open}${url}?v=${v}${close}` : match;
    });
    if(out !== html){
      fs.writeFileSync(file, out);
      stamped++;
    }
  });
  return stamped;
}

/* Every .html file under the given folders (recursively). */
function htmlFiles(root, dirs){
  const found = [];
  const walk = dir => {
    if(!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if(entry.isDirectory()) walk(full);
      else if(entry.name.endsWith(".html")) found.push(full);
    });
  };
  dirs.forEach(d => walk(path.join(root, d)));
  return found;
}

module.exports = { stampAssetVersions, htmlFiles };

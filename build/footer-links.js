/* =========================================================
   KEYS99 - FOOTER LINKS ("Explore Property in <city>")

   A short block of links to the site's own listing pages, chosen for
   the page it is on - not one big list repeated everywhere, which
   search engines treat as boilerplate (or keyword stuffing) and
   ignore:

   - A page about one city (its locality, size, budget and status
     pages, its projects and their blog posts) links to that city's
     pages only: its main page, sizes (2 BHK Flats in Pune...),
     budgets, statuses, a few top localities and commercial pages.
     About a dozen links, never the page itself.
   - A page about no city (About, Contact, Blog, Search, Saved,
     developers, comparisons) gets one "Popular Cities" line.
   - A page whose own content already has most of those links (the
     homepage, a city's main page) gets no block at all.

   Built from the listing pages (build/hubs.js) on every build, so
   new cities, sizes and localities appear by themselves. Only pages
   in the sitemap are linked (an indexable guide, or at least
   HUB_MIN_INDEXED projects), as for "Explore more" on project pages.

   The block sits in #footer, before the copyright line, between
   <!-- footer-links:start --> and <!-- footer-links:end --> markers,
   and is replaced (or removed) on each build.
========================================================= */

const fs = require("fs");
const path = require("path");

const LIMITS = { popular: 4, bhk: 5, budget: 3, localities: 5, commercial: 3, cities: 8 };
/* Skip the block when the page's content already links to this share of it. */
const ALREADY_LINKED = 0.5;

const START = "<!-- footer-links:start -->";
const END = "<!-- footer-links:end -->";

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tidy = s => String(s || "").replace(/₹\s+/g, "₹").replace(/\s+/g, " ").trim();
const citySlug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Status pages in the order buyers look for them. */
const STATUS_ORDER = ["new-launch-projects", "ready-to-move-flats", "under-construction-projects", "upcoming-projects", "resale-flats"];

/* The words a buyer types into Google, from the page's kind. */
function anchorText(h){
  const f = h.footer, city = f.city, name = tidy(f.name);
  if(h.base === "commercial"){
    if(f.kind === "city") return `Commercial Property in ${city}`;
    if(f.kind === "locality") return `Commercial Property in ${name}, ${city}`;
    return tidy(f.h1);                                   // "Office Spaces in Pune"
  }
  if(f.kind === "city") return `New Projects in ${city}`;
  if(f.kind === "locality") return `Flats in ${name}, ${city}`;
  return `${name} in ${city}`;                           // "2 BHK Flats in Pune", "Flats under ₹50 Lakh in Pune"
}

/* hubs: the list buildHubs() returns. listed(hub): is it in the sitemap.
   Returns { cities: Map(city slug -> { name, groups }), popularCities }. */
function collectFooterLinks(hubs, listed){
  const link = h => ({ href: `${h.dir}/`, text: anchorText(h), count: h.count });
  const cities = new Map();
  const cityOf = name => {
    const key = citySlug(name);
    if(!cities.has(key)) cities.set(key, { name, total: 0, main: null, status: [], bhk: [], budget: [], localities: [], commercial: [] });
    return cities.get(key);
  };

  hubs.filter(h => h.footer && h.footer.kind && h.footer.city && h.base !== "developers" && listed(h)).forEach(h => {
    const f = h.footer, c = cityOf(f.city);
    if(h.base === "commercial"){
      c.commercial.push({ ...link(h), order: f.kind === "city" ? 0 : f.kind === "locality" ? 2 : 1 });
    }else if(f.kind === "city"){
      c.total = h.count;
      c.main = link(h);
    }else if(f.kind === "status"){
      const at = STATUS_ORDER.indexOf(h.path.split("/").pop());
      c.status.push({ ...link(h), order: at < 0 ? STATUS_ORDER.length : at });
    }else if(f.kind === "bhk") c.bhk.push({ ...link(h), size: parseFloat(f.name) || 99 });
    else if(f.kind === "budget") c.budget.push(link(h));
    else if(f.kind === "locality") c.localities.push(link(h));
  });

  const out = new Map();
  cities.forEach((c, key) => {
    const groups = [
      { heading: `Property in ${c.name}`, links: [c.main, ...c.status.sort((a, b) => a.order - b.order)].filter(Boolean).slice(0, LIMITS.popular + 1) },
      { heading: "Flats by Size", links: c.bhk.sort((a, b) => a.size - b.size).slice(0, LIMITS.bhk) },
      { heading: "Flats by Budget", links: c.budget.slice(0, LIMITS.budget) },
      { heading: "Top Localities", links: c.localities.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, LIMITS.localities) },
      { heading: "Commercial", links: c.commercial.sort((a, b) => a.order - b.order).slice(0, LIMITS.commercial) }
    ].filter(g => g.links.length);
    if(groups.length) out.set(key, { name: c.name, total: c.total, groups });
  });

  const popularCities = [...cities.values()]
    .filter(c => c.main)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, LIMITS.cities)
    .map(c => ({ ...c.main, text: `Property in ${c.name}` }));

  /* Commercial pages link to commercial pages only. */
  const commercialOut = new Map();
  cities.forEach((c, key) => {
    const links = c.commercial.sort((a, b) => a.order - b.order).slice(0, LIMITS.popular + LIMITS.commercial);
    if(links.length) commercialOut.set(key, { name: c.name, total: c.total, groups: [{ heading: `Commercial Property in ${c.name}`, links }] });
  });
  const commercialCities = [...cities.values()]
    .filter(c => c.commercial.some(l => l.order === 0))
    .sort((a, b) => b.commercial.length - a.commercial.length || a.name.localeCompare(b.name))
    .slice(0, LIMITS.cities)
    .map(c => ({ ...c.commercial.find(l => l.order === 0), text: `Commercial Property in ${c.name}` }));

  return { cities: out, popularCities, commercial: { isCommercial: true, cities: commercialOut, popularCities: commercialCities } };
}

/* The block for one page: its city's links (minus the page itself),
   or the popular cities. `prefix` makes the links relative ("../../"). */
function footerBlock(data, city, selfHref, prefix){
  const a = l => `<a href="${esc(prefix + l.href)}">${esc(l.text)}</a>`;
  const entry = city && data.cities.get(citySlug(city));
  if(entry){
    const groups = entry.groups
      .map(g => ({ ...g, links: g.links.filter(l => l.href !== selfHref) }))
      .filter(g => g.links.length);
    if(!groups.length) return null;
    return {
      hrefs: groups.flatMap(g => g.links.map(l => prefix + l.href)),
      html: `${START}
<section class="footer-links" aria-labelledby="footerLinksTitle">
  <h2 class="footer-links-title" id="footerLinksTitle">Explore ${data.isCommercial ? "Commercial " : ""}Property in ${esc(entry.name)}</h2>
  <div class="fl-groups">
${groups.map(g => `    <div class="fl-group">
      <h3>${esc(g.heading)}</h3>
      <ul>${g.links.map(l => `<li>${a(l)}</li>`).join("")}</ul>
    </div>`).join("\n")}
  </div>
</section>
${END}`
    };
  }
  const cities = data.popularCities.filter(l => l.href !== selfHref);
  if(!cities.length) return null;
  return {
    hrefs: cities.map(l => prefix + l.href),
    html: `${START}
<section class="footer-links footer-links-cities" aria-labelledby="footerLinksTitle">
  <h2 class="footer-links-title" id="footerLinksTitle">Popular Cities</h2>
  <p class="fl-inline">${cities.map(a).join("")}</p>
</section>
${END}`
  };
}

/* Put the right block in the footer of each file (or take it out).
   cityOf(dir): the city a page belongs to, from its folder ("projects/pune/hinjewadi"). */
function injectFooterLinks(root, files, data, cityOf){
  const stats = { city: 0, cities: 0, skipped: 0 };
  files.forEach(file => {
    if(!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, "utf8");
    const footerAt = html.indexOf('<footer id="footer"');
    if(footerAt < 0) return;

    const dir = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean).join("/");
    const prefix = "../".repeat(dir ? dir.split("/").length : 0);
    const self = path.basename(file) === "index.html" ? `${dir}/` : `${dir ? dir + "/" : ""}${path.basename(file, ".html")}`;

    /* The page without last build's block. */
    let page = html, at = -1;
    const s = html.indexOf(START), e = html.indexOf(END);
    if(s > -1 && e > s){
      page = html.slice(0, s) + html.slice(e + END.length);
      at = s;
    }

    const isCommercial = dir === "commercial" || dir.startsWith("commercial/");
    let block = footerBlock(isCommercial ? data.commercial : data, cityOf(dir), self, prefix);
    if(block){
      const own = new Set((page.match(/href="[^"]*"/g) || []).map(m => m.slice(6, -1)));
      const repeated = block.hrefs.filter(h => own.has(h)).length;
      if(repeated / block.hrefs.length >= ALREADY_LINKED) block = null;
    }
    if(!block) stats.skipped++;
    else if(block.html.includes("footer-links-cities")) stats.cities++;
    else stats.city++;

    let out;
    if(at > -1){
      out = page.slice(0, at) + (block ? block.html : "") + page.slice(at);
    }else{
      if(!block) return;
      const c = page.indexOf('<div class="copyright">', footerAt);
      if(c < 0) return;
      out = page.slice(0, c) + block.html + "\n\n    " + page.slice(c);
    }
    if(out !== html) fs.writeFileSync(file, out);
  });
  return stats;
}

module.exports = { collectFooterLinks, footerBlock, injectFooterLinks, anchorText };

/* =========================================================
   KEYS99 - FOOTER LINK DIRECTORY ("Explore Real Estate")

   Like the footers of Housing.com and 99acres: keyword links to the
   site's own listing pages - "New Projects in Pune", "2 BHK Flats in
   Pune", "Flats under ₹50 Lakh in Pune", "Ready to Move Flats in
   Pune", "Flats in Hinjewadi, Pune", "Office Spaces in Pune", the
   developers... Search engines find every listing page from every
   page, and visitors get one-tap shortcuts.

   Built from the listing pages (build/hubs.js) on every build, so
   new cities, localities, sizes and budgets appear by themselves and
   pages that disappear drop out. Only pages that are in the sitemap
   are linked (an indexable guide, or at least HUB_MIN_INDEXED
   projects), the same rule as "Explore more" on project pages.

   One tab per city (busiest first), plus Developers. The tabs are
   radio buttons and CSS - no script - and every link is in the HTML,
   so all of them are crawlable whichever tab is showing.

   The block sits in #footer, before the copyright line, between
   <!-- footer-links:start --> and <!-- footer-links:end --> markers,
   and is replaced on each build.
========================================================= */

const fs = require("fs");
const path = require("path");

const MAX_CITY_TABS = 8;          // the CSS in css/index.css styles up to 9 tabs
const MAX_LOCALITIES = 15;
const MAX_DEVELOPERS = 24;

const START = "<!-- footer-links:start -->";
const END = "<!-- footer-links:end -->";

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tidy = s => String(s || "").replace(/₹\s+/g, "₹").replace(/\s+/g, " ").trim();
const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Status pages in the order buyers look for them. */
const STATUS_ORDER = ["new-launch-projects", "ready-to-move-flats", "under-construction-projects", "upcoming-projects", "resale-flats"];

/* The words a buyer types into Google, from the page's kind. */
function anchorText(h){
  const f = h.footer, city = f.city, name = tidy(f.name);
  if(h.base === "developers") return `${name} Projects`;
  if(h.base === "commercial"){
    if(f.kind === "city") return `Commercial Property in ${city}`;
    if(f.kind === "locality") return `Commercial Property in ${name}, ${city}`;
    return tidy(f.h1);                                   // "Office Spaces in Pune", "Commercial Property For Lease in Pune"
  }
  if(f.kind === "city") return `New Projects in ${city}`;
  if(f.kind === "locality") return `Flats in ${name}, ${city}`;
  return `${name} in ${city}`;                           // "2 BHK Flats in Pune", "Flats under ₹50 Lakh in Pune", "Ready to Move Flats in Pune"
}

/* hubs: the list buildHubs() returns. listed(hub): is it in the sitemap. */
function collectFooterLinks(hubs, listed){
  const link = h => ({ href: `${h.dir}/`, text: anchorText(h), count: h.count });
  const usable = hubs.filter(h => h.footer && h.footer.kind && listed(h));

  const cities = new Map();
  const cityOf = name => {
    if(!cities.has(name)) cities.set(name, { name, total: 0, popular: [], bhk: [], budget: [], localities: [], commercial: [] });
    return cities.get(name);
  };

  usable.forEach(h => {
    const f = h.footer;
    if(h.base === "developers" || !f.city) return;
    const c = cityOf(f.city);
    if(h.base === "commercial"){
      c.commercial.push({ ...link(h), order: f.kind === "city" ? 0 : f.kind === "locality" ? 2 : 1 });
      return;
    }
    if(f.kind === "city"){ c.total = h.count; c.popular.unshift({ ...link(h), order: -1 }); }
    else if(f.kind === "status"){
      const at = STATUS_ORDER.indexOf(h.path.split("/").pop());
      c.popular.push({ ...link(h), order: at < 0 ? STATUS_ORDER.length : at });
    }
    else if(f.kind === "bhk") c.bhk.push({ ...link(h), size: parseFloat(f.name) || 99 });
    else if(f.kind === "budget") c.budget.push(link(h));
    else if(f.kind === "locality") c.localities.push(link(h));
  });

  const byOrder = (a, b) => a.order - b.order;
  const tabs = [...cities.values()]
    .map(c => ({
      label: c.name,
      weight: c.total || c.commercial.reduce((n, l) => Math.max(n, l.count), 0),
      groups: [
        { heading: `Property in ${c.name}`, links: c.popular.sort(byOrder) },
        { heading: `Flats by Size`, links: c.bhk.sort((a, b) => a.size - b.size) },
        { heading: `Flats by Budget`, links: c.budget },
        { heading: `Top Localities`, links: c.localities.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, MAX_LOCALITIES) },
        { heading: `Commercial in ${c.name}`, links: c.commercial.sort(byOrder) }
      ].filter(g => g.links.length)
    }))
    .filter(t => t.groups.length)
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, MAX_CITY_TABS);

  const developers = usable.filter(h => h.base === "developers")
    .sort((a, b) => b.count - a.count || anchorText(a).localeCompare(anchorText(b)))
    .slice(0, MAX_DEVELOPERS)
    .map(link);
  if(developers.length) tabs.push({ label: "Developers", groups: [{ heading: "Top Developers", links: developers }] });

  return tabs;
}

/* The block for a page whose links start with `prefix` ("../../"). */
function footerLinksHtml(tabs, prefix){
  if(!tabs.length) return "";
  const id = i => `fl-${i}`;
  return `${START}
<section class="footer-links" aria-labelledby="footerLinksTitle">
  <h2 class="footer-links-title" id="footerLinksTitle">Explore Real Estate</h2>
  <div class="fl-tabs">
${tabs.map((t, i) => `    <input type="radio" name="fl-tab" id="${id(i)}"${i === 0 ? " checked" : ""}><label for="${id(i)}">${esc(t.label)}</label>`).join("\n")}
    <div class="fl-panels">
${tabs.map(t => `      <div class="fl-panel" data-tab="${esc(slug(t.label))}">
${t.groups.map(g => `        <div class="fl-group">
          <h3>${esc(g.heading)}</h3>
          <ul>${g.links.map(l => `<li><a href="${esc(prefix + l.href)}">${esc(l.text)}</a></li>`).join("")}</ul>
        </div>`).join("\n")}
      </div>`).join("\n")}
    </div>
  </div>
</section>
${END}`;
}

/* Put the block in the footer of each file, replacing last build's. */
function injectFooterLinks(root, files, tabs){
  let changed = 0;
  files.forEach(file => {
    if(!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, "utf8");
    const footerAt = html.indexOf('<footer id="footer"');
    if(footerAt < 0) return;

    const depth = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean).length;
    const block = footerLinksHtml(tabs, "../".repeat(depth));

    let out;
    const s = html.indexOf(START), e = html.indexOf(END);
    if(s > -1 && e > s){
      out = html.slice(0, s) + block + html.slice(e + END.length);
    }else{
      const at = html.indexOf('<div class="copyright">', footerAt);
      if(at < 0) return;
      out = html.slice(0, at) + block + "\n\n    " + html.slice(at);
    }
    if(out !== html){
      fs.writeFileSync(file, out);
      changed++;
    }
  });
  return changed;
}

module.exports = { collectFooterLinks, footerLinksHtml, injectFooterLinks, anchorText };

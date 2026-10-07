/* =========================================================
   KEYS99 - PROJECT COMPARISONS (/compare/<a>-vs-<b>/)

   Buyers close to a decision search "<project A> vs <project B>".
   For each project this pairs it with its closest alternatives in
   the same city (P.pickSimilar: same locality, shared BHK sizes,
   similar price) and writes one static page per pair: a side-by-side
   table, the key differences in plain sentences, and links to both
   project pages. Each project page links to its comparisons.

   The pair's slugs are sorted, so "a-vs-b" and "b-vs-a" are one page.
   A pair where either project has no listed price is built and
   linked but kept out of the index (too little to compare).
========================================================= */

const cheerio = require("cheerio");
const { homepageChrome, rebase } = require("./hubs");
const P = require("../js/project-core.js");

const PER_PROJECT = 3;
const e = P.escapeHtml;

function rateOf(p){
  const f = p.facts.find(x => x.label === "Price / Sq.Ft");
  return f ? f.value : "";
}

function areaRange(p){
  const areas = p.configurations.filter(c => c.areaValue).map(c => c.areaValue);
  if(!areas.length) return "";
  const unit = p.configurations.find(c => c.areaValue).area.replace(/^[\d.,\s]+/, "");
  const lo = Math.min(...areas), hi = Math.max(...areas);
  const n = v => Number(v).toLocaleString("en-IN");
  return lo === hi ? `${n(lo)} ${unit}` : `${n(lo)} – ${n(hi)} ${unit}`;
}

function pairsOf(projects){
  const pairs = new Map();
  projects.forEach(p => {
    P.pickSimilar(p, projects, 10)
      .filter(o => o.city && o.city === p.city)
      .slice(0, PER_PROJECT)
      .forEach(o => {
        const [a, b] = [p, o].sort((x, y) => x.slug.localeCompare(y.slug));
        const slug = `${a.slug}-vs-${b.slug}`;
        if(!pairs.has(slug)) pairs.set(slug, { slug, a, b });
      });
  });
  return [...pairs.values()];
}

/* Plain-sentence differences, only from facts both projects have. */
function differences(a, b){
  const out = [];
  if(a.startingPrice && b.startingPrice && a.startingPrice !== b.startingPrice){
    const [lo, hi] = a.startingPrice < b.startingPrice ? [a, b] : [b, a];
    out.push(`${lo.name} starts lower, at ${lo.startingPriceText} against ${hi.startingPriceText} for ${hi.name}.`);
  }
  const ra = rateOf(a), rb = rateOf(b);
  if(ra && rb && ra !== rb) out.push(`Price per sq ft: ${a.name} ${ra}, ${b.name} ${rb}.`);
  const onlyA = a.bhkLabels.filter(x => !b.bhkLabels.includes(x));
  const onlyB = b.bhkLabels.filter(x => !a.bhkLabels.includes(x));
  const both = a.bhkLabels.filter(x => b.bhkLabels.includes(x));
  if(both.length) out.push(`Both offer ${both.join(", ")}${a.kind === "commercial" ? "" : " homes"}.`);
  if(onlyA.length) out.push(`Only ${a.name} offers ${onlyA.join(", ")}.`);
  if(onlyB.length) out.push(`Only ${b.name} offers ${onlyB.join(", ")}.`);
  if(a.locality && b.locality){
    out.push(a.locality === b.locality
      ? `Both are in ${a.locality}, ${a.city}.`
      : `${a.name} is in ${a.locality} and ${b.name} is in ${b.locality}.`);
  }
  if(a.possession && b.possession && a.possession !== b.possession){
    out.push(`Possession: ${a.name} ${a.possession}, ${b.name} ${b.possession}.`);
  }
  if(a.status && b.status && a.status !== b.status) out.push(`${a.name} is ${a.status.toLowerCase()}; ${b.name} is ${b.status.toLowerCase()}.`);
  if(a.amenities.length && b.amenities.length && a.amenities.length !== b.amenities.length){
    out.push(`${a.name} lists ${a.amenities.length} amenities, ${b.name} lists ${b.amenities.length}.`);
  }
  return out;
}

function head(p){
  const img = p.images[0];
  return `
          <div class="compare-head">
            ${img ? `<a class="compare-photo" href="${p.basePath || "projects"}/${p.slug}/"><img src="${e(img.card)}" data-full="${e(img.url)}" onerror="${P.IMG_FALLBACK}" alt="${e(img.alt || p.name)}" loading="lazy" decoding="async"></a>` : ""}
            <a class="compare-name" href="${p.basePath || "projects"}/${p.slug}/">${e(p.name)}</a>
            <span class="compare-place">${e([p.locality, p.city].filter(Boolean).join(", "))}</span>
          </div>`;
}

function buildPage(pair, ctx){
  const { a, b, slug } = pair;
  const { chrome, siteOrigin, robots, indexable, others } = ctx;
  const prefix = "../../";
  const url = `${siteOrigin}/compare/${slug}/`;
  const thin = !(a.startingPrice && b.startingPrice && a.configurations.length && b.configurations.length);
  const city = a.city;
  const citySlug = P.slugify(city);

  const amen = p => new Set(p.amenities.map(x => x.name.toLowerCase()));
  const amA = amen(a), amB = amen(b);
  const onlyIn = (p, other) => p.amenities.map(x => x.name).filter(n => !other.has(n.toLowerCase()));

  const rows = [
    ["Developer", a.developer, b.developer],
    ["Status", a.status, b.status],
    ["Starting price", a.startingPriceText, b.startingPriceText],
    ["Price / sq ft", rateOf(a), rateOf(b)],
    ["Configurations", a.bhkLabels.join(", "), b.bhkLabels.join(", ")],
    ["Carpet area", areaRange(a), areaRange(b)],
    ["Possession", a.possession, b.possession],
    ["RERA", a.rera, b.rera],
    ...["Land Area", "Towers", "Total Units", "Open Green Area"].map(label => [
      label,
      (a.facts.find(f => f.label === label) || {}).value,
      (b.facts.find(f => f.label === label) || {}).value
    ]),
    ["Amenities", a.amenities.length ? `${a.amenities.length} listed` : "", b.amenities.length ? `${b.amenities.length} listed` : ""],
    ["Only here", onlyIn(a, amB).slice(0, 8).join(", "), onlyIn(b, amA).slice(0, 8).join(", ")]
  ].filter(([, x, y]) => x || y);

  const diffs = differences(a, b);
  const title = P.fitTitle(`${a.name} vs ${b.name} | Price, Size & Amenities | Keys99`);
  const description = P.fitText([
    `${a.name} vs ${b.name} in ${city}: compare starting price, price per sq ft, BHK sizes, carpet area, possession, RERA and amenities side by side.`,
    `${a.name} vs ${b.name}: compare price, BHK sizes, possession and amenities side by side.`,
    `${a.name} vs ${b.name}: price and amenities compared.`
  ], 160);

  const graph = [
    {
      "@type": "WebPage",
      "@id": url + "#webpage",
      url,
      name: `${a.name} vs ${b.name}`,
      description,
      inLanguage: "en-IN",
      isPartOf: { "@id": `${siteOrigin}/#website` },
      dateModified: [a.updatedAt, b.updatedAt].filter(Boolean).sort().pop(),
      about: [a, b].map(p => ({ "@type": p.kind === "commercial" ? "Place" : "ApartmentComplex", "@id": `${siteOrigin}/${p.basePath || "projects"}/${p.slug}/#project`, name: p.name, url: `${siteOrigin}/${p.basePath || "projects"}/${p.slug}/` }))
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin + "/" },
        ...(city && citySlug ? [{ "@type": "ListItem", position: 2, name: city, item: `${siteOrigin}/${a.basePath || "projects"}/${citySlug}/` }] : []),
        { "@type": "ListItem", position: city && citySlug ? 3 : 2, name: `${a.name} vs ${b.name}`, item: url }
      ]
    }
  ];

  const more = others.filter(o => o.slug !== slug).slice(0, 6);

  const main = `
<main class="hub compare-page compare-static">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      ${city && citySlug ? `<a href="${a.basePath || "projects"}/${citySlug}/">${e(city)}</a><span>›</span>` : ""}
      <span aria-current="page">${e(a.name)} vs ${e(b.name)}</span>
    </nav>
    <header class="hub-head">
      <div class="section-kicker">Compare Projects</div>
      <h1>${e(a.name)} vs ${e(b.name)}</h1>
      <p class="hub-intro">Price, sizes, possession, RERA and amenities of ${e(a.name)} and ${e(b.name)}${city ? " in " + e(city) : ""}, side by side.</p>
    </header>

    <div class="compare-scroll">
      <table class="compare-table" style="--cols:2">
        <thead><tr><th scope="col" class="compare-corner"><span>Compare</span></th><th scope="col">${head(a)}</th><th scope="col">${head(b)}</th></tr></thead>
        <tbody>${rows.map(([label, x, y]) => `
          <tr><th scope="row">${e(label)}</th><td>${e(x || "—")}</td><td>${e(y || "—")}</td></tr>`).join("")}
          <tr class="compare-actions"><th scope="row">Details</th>${[a, b].map(p => `<td><a class="btn-primary" href="${p.basePath || "projects"}/${p.slug}/">View ${e(p.name)}</a><a class="compare-view" href="${p.basePath || "projects"}/${p.slug}/#enquiryWrap">Enquire about price</a></td>`).join("")}</tr>
        </tbody>
      </table>
    </div>

    ${diffs.length ? `
    <section class="hub-section" aria-labelledby="keyDifferences">
      <h2 class="section-title" id="keyDifferences">Key Differences</h2>
      <ul class="compare-diffs">${diffs.map(d => `<li>${e(d)}</li>`).join("")}</ul>
      <p class="compare-note">Figures are the listed prices and details on each project's Keys99 page. Confirm current prices with the developer before booking.</p>
    </section>` : ""}

    ${more.length ? `
    <section class="hub-section" aria-labelledby="moreComparisons">
      <h2 class="section-title" id="moreComparisons">More Comparisons</h2>
      <div class="hub-localities">${more.map(o => `
        <a class="locality-chip" href="compare/${o.slug}/"><strong>${e(o.a.name)} vs ${e(o.b.name)}</strong></a>`).join("")}
      </div>
    </section>` : ""}
  </div>
</main>`;

  const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}">
<meta name="robots" content="${indexable && thin ? "noindex,follow" : robots}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Keys99">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<link rel="icon" href="favicon.ico">
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/compare.css">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>
</head>
<body data-root="${prefix}">

${chrome.header}

${chrome.mobileMenu}

${main}

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/hub.js"></script>
<script defer src="js/nav-fx.js"></script>
<script defer src="js/attribution.js"></script>
</body>
</html>
`;
  const $ = cheerio.load(html);
  $(".nav-links a.active").removeClass("active");
  rebase($, prefix);
  return { dir: `compare/${slug}`, slug, draft: thin, lastmod: graph[0].dateModified, html: $.html() };
}

/* projects: normalised projects (root ""). Returns the pages and, per
   project id, its comparisons for the project page's links. */
function buildComparisons({ indexHtml, projects, siteOrigin, robots, indexable }){
  const chrome = homepageChrome(indexHtml);
  const pairs = pairsOf(projects);
  const byProject = new Map();
  pairs.forEach(pair => [pair.a, pair.b].forEach(p => {
    if(!byProject.has(p.id)) byProject.set(p.id, []);
    byProject.get(p.id).push(pair);
  }));
  const pages = pairs.map(pair => buildPage(pair, {
    chrome, siteOrigin, robots, indexable,
    others: [...new Set([...(byProject.get(pair.a.id) || []), ...(byProject.get(pair.b.id) || [])])]
  }));
  const linksById = new Map([...byProject].map(([id, list]) => [id, list.map(pair => {
    const other = pair.a.id === id ? pair.b : pair.a;
    return { slug: pair.slug, name: other.name, place: [other.locality, other.city].filter(Boolean).join(", ") };
  })]));
  return { pages, linksById };
}

module.exports = { buildComparisons };

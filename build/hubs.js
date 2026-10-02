/* =========================================================
   KEYS99 - CITY + LOCALITY HUB PAGES

   /projects/<city>/             every published project in a city
   /projects/<city>/<locality>/  every published project in a locality

   Each page is written with its content in the HTML: a title,
   H1 and introduction composed from the data (project count,
   price range, BHK mix, developers, statuses), the project cards,
   locality links, FAQs, breadcrumbs and JSON-LD (CollectionPage +
   ItemList, BreadcrumbList, FAQPage).

   Nothing is designed twice: the cards come from the homepage's
   own createPropertyCard, and the header, mobile menu, footer and
   bottom navigation are copied from index.html at build time.
========================================================= */

const cheerio = require("cheerio");

const SKIP_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i;

function listText(items, max){
  const list = items.slice(0, max || items.length);
  const more = items.length - list.length;
  const joined = list.length > 1
    ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1]
    : (list[0] || "");
  return more > 0 ? `${joined} and ${more} more` : joined;
}

function plural(n, one, many){
  return `${n} ${n === 1 ? one : many}`;
}

function bhkSortKey(label){
  const n = parseFloat(label);
  return Number.isFinite(n) ? n : 99;
}

/* Everything the copy and FAQs say is computed here, from the
   same mapped projects the cards show. */
function summarise(H, props){
  const prices = [];
  const bhks = new Set();
  props.forEach(p => H.getBhkOptions(p).forEach(o => {
    const price = H.getNumericPrice(o);
    if(price !== null) prices.push(price);
    const bhk = H.normaliseBhkType(o.type);
    if(bhk) bhks.add(bhk);
  }));

  const developers = [...new Set(props.map(p => H.titleCaseName(p.developer)).filter(Boolean))];

  const statusCounts = {};
  props.forEach(p => { if(p.status) statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });

  return {
    count: props.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    bhks: [...bhks].sort((a, b) => bhkSortKey(a) - bhkSortKey(b)),
    developers,
    statuses: Object.entries(statusCounts).sort((a, b) => b[1] - a[1]),
    rera: props.filter(p => String(p.rera_id || "").trim()).length
  };
}

function introText(H, s, place, extra){
  const parts = [];
  parts.push(`Explore ${plural(s.count, "residential project", "residential projects")} in ${place} on Keys99${extra ? ", " + extra : ""}.`);
  if(s.bhks.length) parts.push(`Configurations available: ${listText(s.bhks)}.`);
  if(s.minPrice !== null){
    parts.push(s.maxPrice > s.minPrice
      ? `Prices range from ${H.formatPrice(s.minPrice)} to ${H.formatPrice(s.maxPrice)}.`
      : `Prices start from ${H.formatPrice(s.minPrice)}.`);
  }
  if(s.developers.length) parts.push(`Developers include ${listText(s.developers, 5)}.`);
  if(s.statuses.length) parts.push(`Status: ${s.statuses.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(", ")}.`);
  if(s.rera) parts.push(`${s.rera === s.count ? "All" : s.rera} ${s.rera === 1 ? "is" : "are"} RERA registered.`);
  return parts.join(" ");
}

function faqs(H, s, place){
  const list = [{
    q: `How many new residential projects are there in ${place}?`,
    a: `Keys99 currently lists ${plural(s.count, "residential project", "residential projects")} in ${place}.`
  }];
  if(s.minPrice !== null){
    list.push({
      q: `What is the starting price of flats in ${place}?`,
      a: s.maxPrice > s.minPrice
        ? `Prices for projects in ${place} start from ${H.formatPrice(s.minPrice)} and go up to ${H.formatPrice(s.maxPrice)}, depending on the project and configuration.`
        : `Prices for projects in ${place} start from ${H.formatPrice(s.minPrice)}.`
    });
  }
  if(s.bhks.length){
    list.push({
      q: `Which BHK configurations are available in ${place}?`,
      a: `Projects in ${place} offer ${listText(s.bhks)} homes.`
    });
  }
  if(s.developers.length){
    list.push({
      q: `Which developers have projects in ${place}?`,
      a: `Projects in ${place} are by ${listText(s.developers)}.`
    });
  }
  return list;
}

function pageTitle(H, s, place){
  const bhk = s.bhks.length ? `${listText(s.bhks.map(b => b.replace(/ BHK$/, "")), 4)} BHK Flats` : "Flats";
  return `New Projects in ${place} | ${bhk} for Sale | Keys99`;
}

/* Copy shared chrome from the homepage once per build. */
function homepageChrome(indexHtml){
  const $ = cheerio.load(indexHtml);
  $(".nav-links a.active").removeClass("active");
  return {
    header: $.html($("header.header")),
    mobileMenu: $.html($("#mobileMenu")),
    footer: $.html($("#footer")),
    bottomNav: $.html($("#bottomNav")),
    fonts: $('link[href*="fonts.googleapis.com"]').map((_, el) => $.html(el)).get().join("\n")
  };
}

/* Links in the page are written relative to the site root, then
   re-pointed for the page's depth (works on a sub-path too). */
function rebase($, prefix){
  $("[href], [src]").each((_, el) => {
    ["href", "src"].forEach(attr => {
      const v = $(el).attr(attr);
      if(v && !SKIP_URL.test(v) && !v.startsWith("/")) $(el).attr(attr, prefix + v);
    });
  });
  $("[onerror]").each((_, el) => {
    $(el).attr("onerror", $(el).attr("onerror").replace(/'assets\//g, `'${prefix}assets/`));
  });
}

function hubPage(ctx, hub){
  const { H, chrome, siteOrigin, robots } = ctx;
  const depth = hub.path.split("/").length + 1;            // projects/<city>[/<locality>]/
  const prefix = "../".repeat(depth);
  const url = `${siteOrigin}/projects/${hub.path}/`;
  const s = summarise(H, hub.props);
  const title = pageTitle(H, s, hub.place);
  const intro = introText(H, s, hub.place, hub.introExtra);
  const description = intro.length > 300 ? intro.slice(0, 297).replace(/\s+\S*$/, "") + "…" : intro;
  const questions = faqs(H, s, hub.place);
  const e = H.escapeHtml;

  const crumbs = [{ name:"Home", path:"" }, ...hub.crumbs];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url + "#page",
        name: hub.h1,
        url,
        description,
        inLanguage: "en-IN",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: hub.props.length,
          itemListElement: hub.props.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${siteOrigin}/projects/${H.slugify(p.slug)}/`,
            name: p.project_name || p.slug
          }))
        }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({
          "@type": "ListItem", position: i + 1, name: c.name,
          item: `${siteOrigin}/${c.path ? "projects/" + c.path + "/" : ""}`
        }))
      },
      {
        "@type": "FAQPage",
        mainEntity: questions.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } }))
      }
    ]
  };

  const facts = [
    ["Projects", String(s.count)],
    s.minPrice !== null ? ["Starting from", H.formatPrice(s.minPrice)] : null,
    s.bhks.length ? ["Configurations", s.bhks.join(", ")] : null,
    s.developers.length ? ["Developers", String(s.developers.length)] : null
  ].filter(Boolean);

  const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}">
<meta name="robots" content="${robots(hub.props.length)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Keys99">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(siteOrigin)}/assets/og-default.jpg">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/hub.css">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body data-root="${prefix}">

${chrome.header}

${chrome.mobileMenu}

<main class="hub">
  <div class="container">

    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      ${crumbs.map((c, i) => i < crumbs.length - 1
        ? `<a href="${c.path ? "projects/" + c.path + "/" : "index.html"}">${e(c.name)}</a><span>›</span>`
        : `<span aria-current="page">${e(c.name)}</span>`).join("\n      ")}
    </nav>

    <header class="hub-head">
      <div class="section-kicker">${e(hub.kicker)}</div>
      <h1>${e(hub.h1)}</h1>
      <p class="hub-intro">${e(intro)}</p>
      <dl class="hub-facts">
        ${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join("\n        ")}
      </dl>
    </header>

    <section class="hub-section" aria-labelledby="hubProjects">
      <h2 class="section-title" id="hubProjects">${e(hub.listHeading)}</h2>
      <div class="hub-grid">
        ${hub.props.map(p => H.createPropertyCard(p)).join("")}
      </div>
    </section>

    ${hub.localities && hub.localities.length ? `
    <section class="hub-section" aria-labelledby="hubLocalities">
      <h2 class="section-title" id="hubLocalities">Localities in ${e(hub.cityName)}</h2>
      <div class="hub-localities">
        ${hub.localities.map(l => `
        <a class="locality-chip" href="projects/${e(l.path)}/">
          <strong>${e(l.name)}</strong>
          <span class="count">${plural(l.count, "Project", "Projects")}</span>
        </a>`).join("")}
      </div>
    </section>` : ""}

    ${hub.siblings && hub.siblings.length ? `
    <section class="hub-section" aria-labelledby="hubNearby">
      <h2 class="section-title" id="hubNearby">More localities in ${e(hub.cityName)}</h2>
      <div class="hub-localities">
        ${hub.siblings.map(l => `
        <a class="locality-chip" href="projects/${e(l.path)}/">
          <strong>${e(l.name)}</strong>
          <span class="count">${plural(l.count, "Project", "Projects")}</span>
        </a>`).join("")}
      </div>
    </section>` : ""}

    <section class="hub-section" aria-labelledby="hubFaq">
      <h2 class="section-title" id="hubFaq">Frequently Asked Questions</h2>
      <div class="hub-faqs">
        ${questions.map(f => `
        <details class="hub-faq">
          <summary>${e(f.q)}</summary>
          <p>${e(f.a)}</p>
        </details>`).join("")}
      </div>
    </section>

  </div>
</main>

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/hub.js"></script>
</body>
</html>
`;

  const $ = cheerio.load(html);
  rebase($, prefix);
  return { path: hub.path, html: $.html(), lastmod: hub.lastmod, count: hub.props.length };
}

/* Group mapped projects into city and locality hubs. */
function collectHubs(H, props, reservedSlugs){
  const cities = new Map();

  props.forEach(p => {
    const citySlug = H.slugify(p.city);
    if(!citySlug) return;
    if(!cities.has(citySlug)){
      cities.set(citySlug, { slug: citySlug, name: H.titleCaseName(p.city), state: H.titleCaseName(p.state), props: [], localities: new Map() });
    }
    const city = cities.get(citySlug);
    city.props.push(p);

    const locSlug = H.slugify(p.locality);
    if(!locSlug) return;
    if(!city.localities.has(locSlug)){
      city.localities.set(locSlug, { slug: locSlug, name: H.titleCaseName(p.locality), props: [] });
    }
    city.localities.get(locSlug).props.push(p);
  });

  const hubs = [];
  const latest = list => list.map(p => p.created_at).filter(Boolean).sort().pop();

  cities.forEach(city => {
    if(reservedSlugs.has(city.slug)){
      console.warn(`  skipped  city hub /projects/${city.slug}/: a project already uses that slug`);
      return;
    }
    const localities = [...city.localities.values()]
      .sort((a, b) => b.props.length - a.props.length || a.name.localeCompare(b.name))
      .map(l => ({ path: `${city.slug}/${l.slug}`, name: l.name, count: l.props.length, props: l.props }));

    hubs.push({
      path: city.slug,
      place: city.name,
      cityName: city.name,
      h1: `New Residential Projects in ${city.name}`,
      kicker: city.state ? `${city.name}, ${city.state}` : city.name,
      introExtra: localities.length ? `across ${plural(localities.length, "locality", "localities")} including ${listText(localities.map(l => l.name), 4)}` : "",
      listHeading: `All Projects in ${city.name}`,
      crumbs: [{ name: city.name, path: city.slug }],
      props: city.props,
      localities,
      lastmod: latest(city.props)
    });

    localities.forEach(l => {
      hubs.push({
        path: l.path,
        place: `${l.name}, ${city.name}`,
        cityName: city.name,
        h1: `New Residential Projects in ${l.name}, ${city.name}`,
        kicker: `${l.name} · ${city.name}`,
        introExtra: "",
        listHeading: `Projects in ${l.name}`,
        crumbs: [{ name: city.name, path: city.slug }, { name: l.name, path: l.path }],
        props: l.props,
        siblings: localities.filter(o => o.path !== l.path),
        lastmod: latest(l.props)
      });
    });
  });

  return hubs;
}

function buildHubs({ H, indexHtml, props, reservedSlugs, siteOrigin, robots }){
  const chrome = homepageChrome(indexHtml);
  const ctx = { H, chrome, siteOrigin, robots };
  return collectHubs(H, props, reservedSlugs).map(hub => hubPage(ctx, hub));
}

module.exports = { buildHubs, homepageChrome, rebase };

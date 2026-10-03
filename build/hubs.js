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

/* ---------- BHK pages: /projects/<city>/<n>-bhk-flats/ ----------
   "2 BHK flats in Pune" is how many buyers search, so each city
   gets one page per BHK size it has. The copy quotes the prices and
   carpet areas of that size only, not of the whole project. */

const BHK_LABEL = /^\d+(?:\.\d+)? BHK$/;

function bhkSlug(label){
  return label.replace(/ BHK$/, "").replace(".", "-") + "-bhk-flats";
}

function bhkLabelsOf(H, p){
  return [...new Set(H.getBhkOptions(p).map(o => H.normaliseBhkType(o.type)).filter(b => BHK_LABEL.test(b)))];
}

function bhkCopy(H, hub){
  const label = hub.bhk;
  const city = hub.cityName;
  const n = hub.props.length;
  const options = [];
  hub.props.forEach(p => H.getBhkOptions(p).forEach(o => {
    if(H.normaliseBhkType(o.type) === label) options.push(o);
  }));

  const prices = options.map(o => H.getNumericPrice(o)).filter(v => v !== null);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const priceRange = minPrice === null ? ""
    : maxPrice > minPrice ? `from ${H.formatPrice(minPrice)} to ${H.formatPrice(maxPrice)}` : `from ${H.formatPrice(minPrice)}`;

  const sized = options.filter(o => Number.isFinite(parseFloat(o.sqft)));
  const units = [...new Set(sized.map(o => o.areaUnit || "Sq.Ft"))];
  let areaText = "";
  let oneArea = false;
  if(sized.length && units.length === 1){
    const areas = sized.map(o => parseFloat(o.sqft));
    const fmt = v => Number(v).toLocaleString("en-IN");
    const lo = Math.min(...areas), hi = Math.max(...areas);
    areaText = (hi > lo ? `${fmt(lo)} to ${fmt(hi)}` : fmt(lo)) + " " + units[0];
    oneArea = hi === lo;
  }

  /* Price per sq ft, as on the project page (js/project-core.js). */
  const SQFT_PER_SQM = 10.7639;
  const rates = options.map(o => {
    if(o.unitPrice) return o.unit === " / Sq.M" ? o.unitPrice / SQFT_PER_SQM : o.unitPrice;
    const price = H.getNumericPrice(o);
    if(price === null) return null;
    const area = parseFloat(o.sqft);
    if(!(area > 0)) return null;
    return price / (o.areaUnit === "Sq.M" ? area * SQFT_PER_SQM : area);
  }).filter(r => r).map(r => Math.round(r / 10) * 10);
  const inr = v => "₹ " + Number(v).toLocaleString("en-IN");
  const rateText = !rates.length ? ""
    : Math.max(...rates) > Math.min(...rates)
      ? `${inr(Math.min(...rates))} – ${Number(Math.max(...rates)).toLocaleString("en-IN")} / Sq.Ft`
      : `${inr(rates[0])} / Sq.Ft`;

  const localities = [...new Set(hub.props.map(p => H.titleCaseName(p.locality)).filter(Boolean))];
  const developers = [...new Set(hub.props.map(p => H.titleCaseName(p.developer)).filter(Boolean))];
  const projects = plural(n, "new project", "new projects");

  const intro = [
    `Explore ${projects} with ${label} flats for sale in ${city} on Keys99.`,
    priceRange ? `${label} prices ${maxPrice > minPrice ? "range" : "start"} ${priceRange}.` : "",
    areaText ? (oneArea ? `Carpet area is ${areaText}.` : `Carpet areas range from ${areaText}.`) : "",
    rateText ? `That works out to ${rateText} of carpet area.` : "",
    localities.length ? `Available in ${listText(localities, 5)}.` : "",
    developers.length ? `Developers include ${listText(developers, 4)}.` : ""
  ].filter(Boolean).join(" ");

  const questions = [{
    q: `How many new projects in ${city} have ${label} flats?`,
    a: `Keys99 currently lists ${projects} in ${city} with ${label} flats.`
  }];
  if(priceRange){
    questions.push({
      q: `What is the price of a ${label} flat in ${city}?`,
      a: maxPrice > minPrice
        ? `${label} flats in new projects in ${city} are priced ${priceRange}, depending on the project, floor and carpet area.`
        : `${label} flats in new projects in ${city} start ${priceRange}.`
    });
  }
  if(areaText){
    questions.push({
      q: `What is the carpet area of a ${label} flat in ${city}?`,
      a: oneArea
        ? `${label} flats in these projects have a carpet area of ${areaText}.`
        : `${label} flats in these projects have carpet areas from ${areaText}.`
    });
  }
  if(localities.length){
    questions.push({
      q: `Which localities in ${city} have ${label} projects?`,
      a: `${label} flats are available in ${listText(localities)}.`
    });
  }

  return {
    title: `${label} Flats for Sale in ${city} | ${plural(n, "New Project", "New Projects")} | Keys99`,
    intro,
    questions,
    facts: [
      ["Projects", String(n)],
      minPrice !== null ? ["Starting from", H.formatPrice(minPrice)] : null,
      areaText ? ["Carpet area", areaText] : null,
      rateText ? ["Price / Sq.Ft", rateText] : null,
      localities.length ? ["Localities", String(localities.length)] : null
    ].filter(Boolean)
  };
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

/* Home is linked as "./" (or "./#why"), never "index.html", so
   search engines see one homepage URL. Prefixing "../../" onto "./"
   would give "../.././", so the "./" is dropped first - and put back
   when there is no prefix, since an empty href means "this page". */
function joinPath(prefix, v){
  const joined = prefix + v.replace(/^\.\//, "");
  return joined === "" || joined.startsWith("#") ? "./" + joined : joined;
}

/* Links in the page are written relative to the site root, then
   re-pointed for the page's depth (works on a sub-path too). */
function rebase($, prefix){
  $("[href], [src]").each((_, el) => {
    ["href", "src"].forEach(attr => {
      const v = $(el).attr(attr);
      if(v && !SKIP_URL.test(v) && !v.startsWith("/")) $(el).attr(attr, joinPath(prefix, v));
    });
  });
  $("[onerror]").each((_, el) => {
    $(el).attr("onerror", $(el).attr("onerror").replace(/'assets\//g, `'${prefix}assets/`));
  });
}

/* Crumb paths are relative to their base folder ("projects" unless
   the crumb says otherwise); Home has neither. */
function devLinksSection(hub, e){
  return `
    <section class="hub-section" aria-labelledby="hubDevelopers">
      <h2 class="section-title" id="hubDevelopers">${e(hub.devLinksHeading)}</h2>
      <div class="hub-localities">
        ${hub.devLinks.map(d => `
        <a class="locality-chip" href="developers/${e(d.slug)}/">
          <strong>${e(d.name)}</strong>
          <span class="count">${plural(d.count, "Project", "Projects")}</span>
        </a>`).join("")}
      </div>
    </section>`;
}

/* Google cuts descriptions off at roughly 155-160 characters, so
   take whole sentences of the intro up to that length. Only when the
   first sentence alone is too long is it cut mid-sentence. */
const META_DESCRIPTION_MAX = 160;
function metaDescription(intro){
  if(intro.length <= META_DESCRIPTION_MAX) return intro;
  let out = "";
  /* A sentence ends at . ! or ? followed by a space and a capital or
     ₹ - so "2.5 BHK", "₹ 4.47 Cr" and "Sq.Ft" are not split. */
  for(const sentence of intro.split(/(?<=[.!?])\s+(?=[A-Z₹])/)){
    const next = out ? out + " " + sentence : sentence;
    if(next.length > META_DESCRIPTION_MAX) break;
    out = next;
  }
  return out || intro.slice(0, META_DESCRIPTION_MAX - 1).replace(/\s+\S*$/, "") + "…";
}

function crumbPath(c){
  if(!c.path && !c.base) return "";
  return `${c.base || "projects"}/${c.path ? c.path + "/" : ""}`;
}

function hubPage(ctx, hub){
  const { H, chrome, siteOrigin, robots, shareImageFor, defaultShareImage } = ctx;
  /* Link preview: the first project on the page that has one. */
  const shareImage = shareImageFor ? hub.props.map(shareImageFor).find(Boolean) || null : null;
  const base = hub.base || "projects";                    // top-level folder
  const dirPath = [base, ...hub.path.split("/").filter(Boolean)].join("/");
  const depth = dirPath.split("/").length;                 // projects/<city>[/<locality>]/, developers/[<slug>/]
  const prefix = "../".repeat(depth);
  const url = `${siteOrigin}/${dirPath}/`;
  const s = summarise(H, hub.props);
  const copy = hub.bhk ? bhkCopy(H, hub) : hub.copy ? hub.copy(H, s) : null;
  const title = copy ? copy.title : pageTitle(H, s, hub.place);
  const intro = copy ? copy.intro : introText(H, s, hub.place, hub.introExtra);
  const description = metaDescription(intro);
  const questions = copy ? copy.questions : faqs(H, s, hub.place);
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
          item: `${siteOrigin}/${crumbPath(c)}`
        }))
      },
      {
        "@type": "FAQPage",
        mainEntity: questions.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } }))
      }
    ]
  };

  const facts = copy ? copy.facts : [
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
<meta name="robots" content="${robots(hub.indexCount || hub.props.length)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Keys99">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(shareImage || defaultShareImage || siteOrigin + "/assets/og-default.jpg")}">${shareImage ? `
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">` : ""}
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
        ? `<a href="${crumbPath(c) || "./"}">${e(c.name)}</a><span>›</span>`
        : `<span aria-current="page">${e(c.name)}</span>`).join("\n      ")}
    </nav>

    <header class="hub-head">
      <div class="section-kicker">${e(hub.kicker)}</div>
      <h1>${e(hub.h1)}</h1>
      <p class="hub-intro">${e(intro)}</p>
      ${hub.about ? `<p class="hub-about">${e(hub.about)}</p>` : ""}
      ${hub.website ? `<p class="hub-website"><a href="${e(hub.website)}" target="_blank" rel="noopener nofollow">Visit the ${e(hub.websiteLabel || "official")} website ↗</a></p>` : ""}
      <dl class="hub-facts">
        ${facts.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join("\n        ")}
      </dl>
    </header>

    ${hub.devLinks && hub.devLinks.length && hub.devLinksFirst ? devLinksSection(hub, e) : ""}

    ${hub.hideGrid ? "" : `
    <section class="hub-section" aria-labelledby="hubProjects">
      <h2 class="section-title" id="hubProjects">${e(hub.listHeading)}</h2>
      <div class="hub-grid">
        ${hub.props.map(p => H.createPropertyCard(p)).join("")}
      </div>
    </section>`}

    ${hub.devLinks && hub.devLinks.length && !hub.devLinksFirst ? devLinksSection(hub, e) : ""}

    ${hub.bhkLinks && hub.bhkLinks.length ? `
    <section class="hub-section" aria-labelledby="hubBhk">
      <h2 class="section-title" id="hubBhk">${hub.bhk ? `Other flat sizes in ${e(hub.cityName)}` : `Flats by Size in ${e(hub.cityName)}`}</h2>
      <div class="hub-localities">
        ${hub.bhkLinks.map(b => `
        <a class="locality-chip" href="projects/${e(b.path)}/">
          <strong>${e(b.label)} Flats</strong>
          <span class="count">${plural(b.count, "Project", "Projects")}</span>
        </a>`).join("")}
      </div>
    </section>` : ""}

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
<script defer src="js/attribution.js"></script>
<script defer src="js/compare-tray.js"></script>
</body>
</html>
`;

  const $ = cheerio.load(html);
  rebase($, prefix);
  return { base, path: hub.path, dir: dirPath, html: $.html(), lastmod: hub.lastmod, count: hub.indexCount || hub.props.length };
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

    const bhkGroups = new Map();
    city.props.forEach(p => bhkLabelsOf(H, p).forEach(label => {
      if(!bhkGroups.has(label)) bhkGroups.set(label, []);
      bhkGroups.get(label).push(p);
    }));
    const bhkPages = [...bhkGroups]
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([label, props]) => ({ label, slug: bhkSlug(label), path: `${city.slug}/${bhkSlug(label)}`, count: props.length, props }))
      .filter(b => {
        if(!city.localities.has(b.slug)) return true;
        console.warn(`  skipped  BHK page /projects/${b.path}/: a locality already uses that slug`);
        return false;
      });

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
      bhkLinks: bhkPages,
      lastmod: latest(city.props)
    });

    bhkPages.forEach(b => {
      hubs.push({
        path: b.path,
        place: city.name,
        cityName: city.name,
        bhk: b.label,
        h1: `${b.label} Flats for Sale in ${city.name}`,
        kicker: `${b.label} · ${city.name}`,
        listHeading: `New Projects with ${b.label} Flats in ${city.name}`,
        crumbs: [{ name: city.name, path: city.slug }, { name: `${b.label} Flats`, path: b.path }],
        props: b.props,
        bhkLinks: bhkPages.filter(o => o.path !== b.path),
        localities,
        lastmod: latest(b.props)
      });
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

/* ---------- Developer pages: /developers/ and /developers/<slug>/ ----------
   "<builder name> projects" is a common search. Each developer with a
   published project gets a page listing all of their projects; the
   description, logo and website appear when the developer record has
   them. /developers/ lists every developer. */

function developerCopy(H, s, dev, place){
  const n = s.count;
  const names = dev.props.map(p => p.project_name || p.title).filter(Boolean);
  const localities = [...new Set(dev.props.map(p => H.titleCaseName(p.locality)).filter(Boolean))];
  const priceRange = s.minPrice === null ? ""
    : s.maxPrice > s.minPrice ? `from ${H.formatPrice(s.minPrice)} to ${H.formatPrice(s.maxPrice)}` : `from ${H.formatPrice(s.minPrice)}`;

  const intro = [
    `${dev.name} has ${plural(n, "residential project", "residential projects")} listed on Keys99 in ${localities.length ? listText(localities, 5) + ", " : ""}${place}.`,
    s.bhks.length ? `Configurations: ${listText(s.bhks)}.` : "",
    priceRange ? `Prices ${s.maxPrice > s.minPrice ? "range" : "start"} ${priceRange}.` : "",
    s.statuses.length ? `Status: ${s.statuses.map(([label, c]) => `${c} ${label.toLowerCase()}`).join(", ")}.` : ""
  ].filter(Boolean).join(" ");

  const questions = [{
    q: `Which ${dev.name} projects are listed on Keys99?`,
    a: names.length ? `${dev.name} projects on Keys99: ${listText(names)}.` : `Keys99 lists ${plural(n, "project", "projects")} by ${dev.name}.`
  }];
  if(priceRange){
    questions.push({
      q: `What is the price of ${dev.name} projects?`,
      a: `${dev.name} projects on Keys99 are priced ${priceRange}, depending on the project and configuration.`
    });
  }
  if(localities.length){
    questions.push({
      q: `Where are ${dev.name} projects located?`,
      a: `${dev.name} has projects in ${listText(localities)}, ${place}.`
    });
  }
  questions.push({
    q: `Are ${dev.name} projects RERA registered?`,
    a: (s.rera
      ? `${s.rera === n ? (n === 1 ? "The project lists" : "All " + n + " projects list") : s.rera + " of " + n + " projects list"} a RERA registration number on its Keys99 page.`
      : `None of these projects lists a RERA registration number on Keys99 yet.`) +
      " Always check the number on the state RERA portal (MahaRERA in Maharashtra) before booking."
  });

  return {
    title: `${dev.name} Projects in ${place} | Prices & Configurations | Keys99`,
    intro,
    questions,
    facts: [
      ["Projects", String(n)],
      s.minPrice !== null ? ["Starting from", H.formatPrice(s.minPrice)] : null,
      s.bhks.length ? ["Configurations", s.bhks.join(", ")] : null,
      localities.length ? ["Localities", String(localities.length)] : null
    ].filter(Boolean)
  };
}

function collectDeveloperHubs(H, props, rows){
  const info = new Map();
  (rows || []).forEach(r => {
    const d = r && r.developer;
    if(d && d.name) info.set(H.slugify(d.name), d);
  });

  const groups = new Map();
  props.forEach(p => {
    const slug = H.slugify(p.developer);
    if(!slug) return;
    if(!groups.has(slug)) groups.set(slug, { slug, name: H.titleCaseName(p.developer), props: [] });
    groups.get(slug).props.push(p);
  });
  const devs = [...groups.values()]
    .map(d => ({ ...d, count: d.props.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if(!devs.length) return [];

  const latest = list => list.map(p => p.created_at).filter(Boolean).sort().pop();
  const citiesOf = list => [...new Set(list.map(p => H.titleCaseName(p.city)).filter(Boolean))];
  const allCities = citiesOf(props);
  const place = listText(allCities, 3) || "India";
  const devProps = devs.flatMap(d => d.props);
  const text = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

  const pages = [{
    base: "developers",
    path: "",
    place,
    h1: `Real Estate Developers in ${place}`,
    kicker: "Developers",
    crumbs: [{ name: "Developers", base: "developers" }],
    props: devProps,
    hideGrid: true,
    devLinks: devs,
    devLinksFirst: true,
    devLinksHeading: "All Developers on Keys99",
    indexCount: devs.length,
    copy: () => ({
      title: `Real Estate Developers & Builders in ${place} | Keys99`,
      intro: `Browse ${plural(devs.length, "developer", "developers")} with ${plural(devProps.length, "new residential project", "new residential projects")} in ${place} on Keys99, including ${listText(devs.map(d => d.name), 4)}. Open a developer to see all of their projects, prices and configurations.`,
      questions: [{
        q: `Which developers have new projects in ${place}?`,
        a: `Keys99 lists projects by ${listText(devs.map(d => d.name))}.`
      }, {
        q: `Which developer has the most projects on Keys99?`,
        a: `${devs[0].name} has the most, with ${plural(devs[0].count, "project", "projects")}.`
      }],
      facts: [
        ["Developers", String(devs.length)],
        ["Projects", String(devProps.length)],
        ["Cities", String(allCities.length)]
      ]
    }),
    lastmod: latest(devProps)
  }];

  devs.forEach(d => {
    const extra = info.get(d.slug) || {};
    const website = /^https?:\/\//i.test(text(extra.website)) ? text(extra.website) : "";
    const dPlace = listText(citiesOf(d.props), 3) || "India";
    pages.push({
      base: "developers",
      path: d.slug,
      place: dPlace,
      h1: `${d.name} Projects in ${dPlace}`,
      kicker: "Developer",
      listHeading: `Projects by ${d.name}`,
      crumbs: [{ name: "Developers", base: "developers" }, { name: d.name, base: "developers", path: d.slug }],
      props: d.props,
      about: text(extra.description),
      website,
      websiteLabel: d.name,
      devLinks: devs.filter(o => o.slug !== d.slug),
      devLinksHeading: "Other Developers",
      copy: (H, s) => developerCopy(H, s, d, dPlace),
      lastmod: latest(d.props)
    });
  });
  return pages;
}

function buildHubs({ H, indexHtml, props, rows, reservedSlugs, siteOrigin, robots, shareImageFor, defaultShareImage }){
  const chrome = homepageChrome(indexHtml);
  const ctx = { H, chrome, siteOrigin, robots, shareImageFor, defaultShareImage };
  return [...collectHubs(H, props, reservedSlugs), ...collectDeveloperHubs(H, props, rows)]
    .map(hub => hubPage(ctx, hub));
}

module.exports = { buildHubs, homepageChrome, rebase, joinPath, summarise, introText, faqs, listText, bhkSlug, bhkLabelsOf };

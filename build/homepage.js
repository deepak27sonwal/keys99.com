/* =========================================================
   KEYS99 - HOMEPAGE PRE-RENDER

   Writes New Launch, Popular, Top Cities and Top Localities,
   plus the stats bar and property-type counts, into index.html
   so crawlers see real projects and links without running
   JavaScript.

   The card markup is not duplicated here: the homepage's own
   top-level functions (mapResidentialProject, createPropertyCard,
   cityCardHtml, ...) are read out of js/home.js with acorn and run
   in a sandbox, so the built HTML is exactly what the page renders
   live. Only function declarations and constants with plain
   literal values are taken - nothing that touches the DOM runs.
========================================================= */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const acorn = require("acorn");
const cheerio = require("cheerio");
const { summarise, introText, faqs, listText, bhkSlug, bhkLabelsOf, cityFilterPages } = require("./hubs");

const EXPORTS = [
  "mapResidentialProject", "mapCommercialProject", "mergeByNewest", "createPropertyCard", "cityCardHtml", "localityChipHtml",
  "computeTopCities", "computeTopLocalities", "computeSiteStats",
  "formatStatCount", "typeCountText",
  "POPULAR_COUNT", "NEW_LAUNCH_COUNT", "TOP_CITY_COUNT", "TOP_LOCALITY_COUNT",
  "slugify", "titleCaseName", "formatPrice", "getNumericPrice", "getBhkOptions",
  "normaliseBhkType", "escapeHtml", "cityUrl", "localityUrl",
  "getImageUrl", "thumbName", "THUMB_DIR"
];

/* A constant is safe to evaluate when its value is built only from
   literals - no identifiers, calls or member access. */
function isPlainValue(node){
  if(!node) return false;
  switch(node.type){
    case "Literal": return true;
    case "TemplateLiteral": return node.expressions.length === 0;
    case "UnaryExpression": return isPlainValue(node.argument);
    case "BinaryExpression": return isPlainValue(node.left) && isPlainValue(node.right);
    case "ArrayExpression": return node.elements.every(isPlainValue);
    case "ObjectExpression":
      return node.properties.every(p => p.type === "Property" && !p.computed && isPlainValue(p.value));
    default: return false;
  }
}

/* The homepage's own script, js/home.js (a page-relative link,
   possibly with a ?v= version). Inline scripts are read too. */
const HOME_SCRIPT = /^js\/home\.js(?:\?|$)/;

function loadHomepageFunctions(html, supabaseUrl){
  const $ = cheerio.load(html);
  const pieces = [];
  const sources = [];

  $("script").each((_, el) => {
    const type = $(el).attr("type");
    if(type && type !== "text/javascript" && type !== "module") return;
    const src = $(el).attr("src");
    if(!src) sources.push($(el).html());
    else if(HOME_SCRIPT.test(src)) sources.push(fs.readFileSync(path.join(__dirname, "..", "js", "home.js"), "utf8"));
  });

  sources.forEach(code => {
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
    ast.body.forEach(node => {
      if(node.type === "FunctionDeclaration"){
        pieces.push(code.slice(node.start, node.end));
      }else if(node.type === "VariableDeclaration" && node.declarations.every(d => isPlainValue(d.init))){
        pieces.push(code.slice(node.start, node.end));
      }
    });
  });

  const context = vm.createContext({ SUPABASE_URL: supabaseUrl, console });
  const exportList = EXPORTS.map(name => `${name}: typeof ${name} === "undefined" ? undefined : ${name}`).join(", ");
  const api = vm.runInContext(pieces.join("\n\n") + `\n;({ ${exportList} })`, context);

  const missing = EXPORTS.filter(name => api[name] === undefined);
  if(missing.length) throw new Error("index.html / js/home.js no longer define: " + missing.join(", "));
  return api;
}

function replaceBetween(html, key, content){
  const re = new RegExp(`(<!--keys99:${key}:start-->)[\\s\\S]*?(<!--keys99:${key}:end-->)`);
  if(!re.test(html)) throw new Error(`index.html is missing the keys99:${key} markers`);
  return html.replace(re, (_, start, end) => `${start}${content}\n  ${end}`);
}

/* Title, description, preview tags and the H1 place name follow
   where the projects actually are, busiest city first. Every city is
   named while the list is short ("Pune, Hyderabad & Indore"): a vague
   "& More" is not something anyone searches for. Past four cities
   the rest are summed up. */
function placeText(cities){
  if(cities.length <= 1) return cities[0] || "India";
  const list = cities.length <= 4 ? cities : [...cities.slice(0, 3), "Other Cities"];
  return list.slice(0, -1).join(", ") + " & " + list[list.length - 1];
}

function applyHomepageSeo(H, html, props){
  const cities = H.computeTopCities(props, 50).map(c => H.titleCaseName(c.city));
  const localities = H.computeTopLocalities(props, 50).map(l => H.titleCaseName(l.locality));
  if(!cities.length) return html;

  const place = placeText(cities);
  const prices = [];
  const bhks = new Set();
  props.forEach(p => H.getBhkOptions(p).forEach(o => {
    const price = H.getNumericPrice(o);
    if(price !== null) prices.push(price);
    const bhk = H.normaliseBhkType(o.type);
    if(/bhk/i.test(bhk)) bhks.add(bhk.replace(/ BHK$/i, ""));
  }));
  const bhkList = [...bhks].sort((a, b) => parseFloat(a) - parseFloat(b));
  const join = list => list.length > 1 ? list.slice(0, -1).join(", ") + " & " + list[list.length - 1] : (list[0] || "");

  /* Google cuts titles off at about 60 characters, so the title names
     as many cities as fit, busiest first - the one most of the
     projects are in leads the keyword. */
  const title = [
    `New Projects & Flats for Sale in ${place} | Keys99`,
    cities.length > 1 ? `New Projects & Flats for Sale in ${cities[0]} & ${cities[1]} | Keys99` : null,
    `New Projects & Flats for Sale in ${cities[0]} | Keys99`
  ].find(t => t && t.length <= 60) || `New Projects & Flats for Sale in ${cities[0]} | Keys99`;
  const explore = n => `Explore ${props.length} new residential project${props.length === 1 ? "" : "s"} in ${place}` +
    (n && localities.length ? ` across ${join(localities.slice(0, n))}` : "") + ".";
  const compare = `Compare ${bhkList.length ? join(bhkList) + " BHK flats" : "flats"}` +
    (prices.length ? ` from ${H.formatPrice(Math.min(...prices))}` : "");
  /* Longest version that fits Google's ~160-character snippet. */
  const description = [
    `${explore(4)} ${compare}, RERA details, floor plans and amenities on Keys99.`,
    `${explore(2)} ${compare}, RERA details and floor plans on Keys99.`,
    `${explore(0)} ${compare}, RERA details and floor plans on Keys99.`,
    `${explore(0)} ${compare} on Keys99.`
  ].find(d => d.length <= 160) || `${explore(0)} ${compare} on Keys99.`;

  /* Hero line under the H1: what a buyer can do here, where and from
     what price, in place of a generic slogan. */
  const range = bhkList.length > 1 ? `${bhkList[0]}–${bhkList[bhkList.length - 1]} BHK` : (bhkList.length ? `${bhkList[0]} BHK` : "");
  const heroIntro = `Compare prices, floor plans and RERA details of new ${range ? range + " " : ""}flats` +
    (localities.length > 3 ? ` in ${localities.slice(0, 3).join(", ")} and more`
      : localities.length ? ` in ${join(localities)}` : ` in ${place}`) +
    (prices.length ? `, starting from ${H.formatPrice(Math.min(...prices))}.` : ".");

  const attr = v => H.escapeHtml(v);
  html = html
    .replace(/(<p data-seo="hero-intro">)[\s\S]*?(<\/p>)/, `$1${attr(heroIntro)}$2`)
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${attr(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${attr(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${attr(description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${attr(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${attr(description)}$2`)
    .replace(/(<span data-seo="place">)[^<]*(<\/span>)/g, `$1${attr(place)}$2`)
    .replace(/("@type":"RealEstateAgent"[^<]*?"description":")[^"]*(")/,
      `$1Property portal listing new residential projects and flats for sale in ${place.replace(/"/g, "")}.$2`);
  return html;
}

/* Buyer's guide: an intro and FAQs written from the live numbers,
   plus a few general questions, so the homepage has real text for
   search engines to read. The same FAQs go into FAQPage JSON-LD. */
function generalFaqs(place){
  return [
    {
      q: "How do I check whether a project is RERA registered?",
      a: "Each project page shows the RERA registration number provided for that project. Before you pay a booking amount, look the number up on your state's RERA portal - MahaRERA for projects in Maharashtra - and check the project details and approvals listed there."
    },
    {
      q: "What is the difference between a new launch, under-construction and ready-to-move project?",
      a: "A new launch has just opened for booking and usually has the widest choice of units, with possession several years away. An under-construction project is being built, with a possession date set by the developer. A ready-to-move project is complete, so you can see the finished home before you buy."
    },
    {
      q: `How do I enquire about a project in ${place}?`,
      a: "Open the project page and use the Enquire Now form. Your name, number and message go to the Keys99 team and the agent assigned to that project, who will contact you with prices, floor plans and site-visit times."
    }
  ];
}

function buildGuide(H, props, commercialProps){
  const cities = H.computeTopCities(props, 50);
  if(!cities.length) return { html: "", faqs: [] };

  const place = placeText(cities.map(c => H.titleCaseName(c.city)));
  const s = summarise(H, props);
  const questions = [...faqs(H, s, place), ...generalFaqs(place)];
  const localities = H.computeTopLocalities(props, 12);
  const e = H.escapeHtml;
  /* A link chip, with the number of projects behind it when known. */
  const chip = (href, text, count) =>
    `<a class="guide-chip" href="${e(href)}">${e(text)}${count ? `<span>${count}</span>` : ""}</a>`;

  const mainCity = cities[0].city;
  const mainName = H.titleCaseName(mainCity);
  const cityProps = props.filter(p => H.slugify(p.city) === H.slugify(mainCity));

  /* BHK pages of the main city (build/hubs.js makes one per size). */
  const sizes = [...new Set(cityProps.flatMap(p => bhkLabelsOf(H, p)))]
    .sort((a, b) => parseFloat(a) - parseFloat(b))
    .map(b => ({ label: b, count: cityProps.filter(p => bhkLabelsOf(H, p).includes(b)).length }));

  /* Budget and status pages of the main city (build/hubs.js). */
  const cityLocalities = new Set(cityProps.map(p => H.slugify(p.locality)).filter(Boolean));
  const filters = cityFilterPages(H, H.slugify(mainCity), cityProps, cityLocalities);

  /* Developer pages (build/hubs.js). */
  const devs = [];
  props.forEach(p => {
    const slug = H.slugify(p.developer);
    if(!slug) return;
    const found = devs.find(d => d.slug === slug);
    if(found) found.count++;
    else devs.push({ slug, name: H.titleCaseName(p.developer), count: 1 });
  });

  const groups = [
    { icon: "⌖", title: "Browse by city",
      chips: cities.map(c => chip(H.cityUrl(c.city), H.titleCaseName(c.city), c.count)) },
    { icon: "◎", title: "Popular localities",
      chips: localities.map(l => chip(H.localityUrl(l.city, l.locality), H.titleCaseName(l.locality), l.count)) },
    { icon: "▣", title: `Flats by size in ${mainName}`,
      chips: sizes.map(b => chip(`${H.cityUrl(mainCity)}${bhkSlug(b.label)}/`, b.label, b.count)) },
    { icon: "₹", title: `Flats by budget in ${mainName}`,
      chips: filters.budgets.map(b => chip(`projects/${b.path}/`, b.label, b.count)) },
    { icon: "◷", title: `By status in ${mainName}`,
      chips: filters.statuses.map(st => chip(`projects/${st.path}/`, st.label, st.count)) },
    /* Commercial pages (build/hubs.js), by city. */
    { icon: "▤", title: "Commercial property",
      chips: (commercialProps && commercialProps.length ? [
        ...H.computeTopCities(commercialProps, 6).map(c => chip(H.cityUrl(c.city, "commercial"), `Commercial in ${H.titleCaseName(c.city)}`, c.count)),
        `<a class="guide-chip guide-chip-more" href="commercial/">All commercial →</a>`
      ] : []) },
    { icon: "▥", title: "Projects by developer",
      chips: [...devs.slice(0, 6).map(d => chip(`developers/${d.slug}/`, d.name, d.count)),
        `<a class="guide-chip guide-chip-more" href="developers/">All developers →</a>`] }
  ].filter(g => g.chips.length);

  /* Headline numbers. */
  const bhkRange = s.bhks.length > 1
    ? `${s.bhks[0].replace(/ BHK$/, "")} – ${s.bhks[s.bhks.length - 1]}`
    : (s.bhks[0] || "");
  const stats = [
    ["Projects", String(s.count), `across ${cities.length} ${cities.length === 1 ? "city" : "cities"}`],
    s.minPrice !== null ? ["Starting from", H.formatPrice(s.minPrice),
      s.maxPrice > s.minPrice ? `up to ${H.formatPrice(s.maxPrice)}` : ""] : null,
    bhkRange ? ["Configurations", bhkRange, s.bhks.length > 1 ? `${s.bhks.length} flat sizes` : ""] : null,
    ["RERA registered", String(s.rera), `of ${s.count} projects`]
  ].filter(Boolean);

  const html = `
<section id="guide" class="home-guide" aria-labelledby="guideTitle">
  <div class="container">
    <div class="guide-panel">

      <div class="guide-head">
        <div class="section-kicker">Buyer's Guide</div>
        <h2 class="section-title" id="guideTitle">New Residential Projects in ${e(place)}</h2>
        <p class="home-guide-intro">${e(introText(H, s, place))}</p>
      </div>

      <dl class="guide-stats">${stats.map(([label, value, note]) => `
        <div class="guide-stat">
          <dt>${e(label)}</dt>
          <dd>${e(value)}</dd>${note ? `
          <small>${e(note)}</small>` : ""}
        </div>`).join("")}
      </dl>

      <div class="guide-browse">${groups.map(g => `
        <div class="guide-group">
          <h3><span class="guide-icon" aria-hidden="true">${g.icon}</span>${e(g.title)}</h3>
          <div class="guide-chips">${g.chips.join("")}</div>
        </div>`).join("")}
      </div>

      <div class="guide-faq">
        <h3>Frequently Asked Questions</h3>
        <div class="hub-faqs">${questions.map(f => `
          <details class="hub-faq">
            <summary>${e(f.q)}</summary>
            <p>${e(f.a)}</p>
          </details>`).join("")}
        </div>
      </div>

    </div>
  </div>
</section>`;
  return { html, faqs: questions };
}

/* reelsHtml: the "Reels" strip from build/extra-pages.js.
   siteOrigin: the canonical address, for the URLs in the ItemList. */
function buildHomepage(indexPath, rows, supabaseUrl, reelsHtml, siteOrigin){
  let html = fs.readFileSync(indexPath, "utf8");
  const H = loadHomepageFunctions(html, supabaseUrl);

  /* Same order and filters as the live page: newest published first. */
  /* Homes and commercial projects, newest published first. The SEO
     copy and the Buyer's Guide stay about homes (with a commercial
     link group); the cards, counts and Commercial tile cover both. */
  const props = H.mergeByNewest(
    rows.filter(row => row.__kind !== "commercial").map(row => H.mapResidentialProject(row)),
    rows.filter(row => row.__kind === "commercial").map(row => H.mapCommercialProject(row)));
  const homes = props.filter(p => p.kind !== "commercial");
  const commercial = props.filter(p => p.kind === "commercial");

  html = replaceBetween(html, "newlaunches",
    props.filter(p => p.is_new_launch).slice(0, H.NEW_LAUNCH_COUNT)
      .map(p => H.createPropertyCard(p, "New Launch", "st-new-launch")).join(""));
  const popular = props.slice(0, H.POPULAR_COUNT);
  html = replaceBetween(html, "popular", popular.map(p => H.createPropertyCard(p)).join(""));
  html = replaceBetween(html, "cities",
    H.computeTopCities(props, H.TOP_CITY_COUNT).map(H.cityCardHtml).join(""));
  html = replaceBetween(html, "localities",
    H.computeTopLocalities(props, H.TOP_LOCALITY_COUNT).map(H.localityChipHtml).join(""));

  /* Numbers: only the text of the marked elements changes. */
  const stats = H.computeSiteStats(props);
  html = html.replace(/(<strong data-stat="(\w+)">)[^<]*(<\/strong>)/g,
    (_, open, key, close) => open + H.formatStatCount(stats[key]) + close);
  html = html.replace(/(<p data-type-count="(\w+)">)[^<]*(<\/p>)/g,
    (_, open, key, close) => open + H.typeCountText(stats.types[key]) + close);
  /* Type cards link to their search results only when there is
     something to show - same rule as setTypeCardState() in the page. */
  html = html.replace(/<a class="type-card" data-type="(\w+)"(?: href="[^"]*"| aria-disabled="true")>/g,
    (_, key) => `<a class="type-card" data-type="${key}" ` +
      (!stats.types[key] ? `aria-disabled="true">`
        : key === "commercial" ? `href="commercial/">` : `href="projects/search?type=${key}">`));

  html = applyHomepageSeo(H, html, homes.length ? homes : props);

  const guide = buildGuide(H, homes.length ? homes : props, commercial);
  html = replaceBetween(html, "guide", guide.html);
  html = replaceBetween(html, "reels", reelsHtml || "");
  const faqLd = guide.faqs.length ? `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))
  }).replace(/</g, "\\u003c")}</script>` : "";
  html = replaceBetween(html, "faqld", faqLd);

  /* The Popular cards as an ItemList: tells search engines the page
     lists these projects, each with its own page, in this order. */
  const cities = H.computeTopCities(props, 50).map(c => H.titleCaseName(c.city));
  const origin = String(siteOrigin || "https://keys99.com").replace(/\/+$/, "");
  const itemListLd = popular.length ? `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Popular New Projects in ${placeText(cities)}`,
    itemListElement: popular.filter(p => p.slug).map((p, i) => ({
      "@type": "ListItem", position: i + 1, url: `${origin}/${p.base || "projects"}/${p.slug}/`, name: p.project_name
    }))
  }).replace(/</g, "\\u003c")}</script>` : "";
  html = replaceBetween(html, "itemlistld", itemListLd);

  fs.writeFileSync(indexPath, html);
  return { projects: props.length, stats };
}

module.exports = { buildHomepage, loadHomepageFunctions };

/* =========================================================
   KEYS99 - HOMEPAGE PRE-RENDER

   Writes New Launch, Popular, Top Cities and Top Localities,
   plus the stats bar and property-type counts, into index.html
   so crawlers see real projects and links without running
   JavaScript.

   The card markup is not duplicated here: the homepage's own
   top-level functions (mapResidentialProject, createPropertyCard,
   cityCardHtml, ...) are read out of index.html with acorn and run
   in a sandbox, so the built HTML is exactly what the page renders
   live. Only function declarations and constants with plain
   literal values are taken - nothing that touches the DOM runs.
========================================================= */

const fs = require("fs");
const vm = require("vm");
const acorn = require("acorn");
const cheerio = require("cheerio");
const { summarise, introText, faqs, listText, bhkSlug, bhkLabelsOf } = require("./hubs");

const EXPORTS = [
  "mapResidentialProject", "createPropertyCard", "cityCardHtml", "localityChipHtml",
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

function loadHomepageFunctions(html, supabaseUrl){
  const $ = cheerio.load(html);
  const pieces = [];

  $("script:not([src])").each((_, el) => {
    const type = $(el).attr("type");
    if(type && type !== "text/javascript" && type !== "module") return;
    const code = $(el).html();
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
  if(missing.length) throw new Error("index.html no longer defines: " + missing.join(", "));
  return api;
}

function replaceBetween(html, key, content){
  const re = new RegExp(`(<!--keys99:${key}:start-->)[\\s\\S]*?(<!--keys99:${key}:end-->)`);
  if(!re.test(html)) throw new Error(`index.html is missing the keys99:${key} markers`);
  return html.replace(re, (_, start, end) => `${start}${content}\n  ${end}`);
}

/* Title, description, preview tags and the H1 place name follow
   where the projects actually are: "Pune" today, "Pune & Mumbai"
   with two cities, "Pune, Mumbai & More" beyond that. */
function placeText(cities){
  if(cities.length <= 1) return cities[0] || "India";
  if(cities.length === 2) return `${cities[0]} & ${cities[1]}`;
  return `${cities[0]}, ${cities[1]} & More`;
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

  const title = `New Projects & Flats for Sale in ${place} | Keys99`;
  const description = [
    `Explore ${props.length} new residential project${props.length === 1 ? "" : "s"} in ${place}` +
      (localities.length ? ` across ${join(localities.slice(0, 4))}` : "") + ".",
    `Compare ${bhkList.length ? join(bhkList) + " BHK flats" : "flats"}` +
      (prices.length ? ` from ${H.formatPrice(Math.min(...prices))}` : "") +
      ", RERA details, floor plans and amenities on Keys99."
  ].join(" ");

  const attr = v => H.escapeHtml(v);
  html = html
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

function buildGuide(H, props){
  const cities = H.computeTopCities(props, 50);
  if(!cities.length) return { html: "", faqs: [] };

  const place = placeText(cities.map(c => H.titleCaseName(c.city)));
  const s = summarise(H, props);
  const questions = [...faqs(H, s, place), ...generalFaqs(place)];
  const localities = H.computeTopLocalities(props, 12);
  const e = H.escapeHtml;
  const link = (href, text) => `<a href="${e(href)}">${e(text)}</a>`;

  const browse = [
    cities.length > 1 || !localities.length
      ? `Browse by city: ${listText(cities.map(c => link(H.cityUrl(c.city), H.titleCaseName(c.city))))}.`
      : `See ${link(H.cityUrl(cities[0].city), "all new projects in " + H.titleCaseName(cities[0].city))}.`,
    localities.length
      ? `Popular localities: ${listText(localities.map(l => link(H.localityUrl(l.city, l.locality), H.titleCaseName(l.locality))))}.`
      : ""
  ].filter(Boolean).join(" ");

  /* BHK pages of the main city (build/hubs.js makes one per size). */
  const mainCity = cities[0].city;
  const sizes = [...new Set(props.filter(p => H.slugify(p.city) === H.slugify(mainCity)).flatMap(p => bhkLabelsOf(H, p)))]
    .sort((a, b) => parseFloat(a) - parseFloat(b));
  const sizeLinks = sizes.length
    ? ` Flats by size in ${e(H.titleCaseName(mainCity))}: ${listText(sizes.map(b => link(`${H.cityUrl(mainCity)}${bhkSlug(b)}/`, b)))}.`
    : "";

  /* Developer pages (build/hubs.js). */
  const devs = [];
  props.forEach(p => {
    const slug = H.slugify(p.developer);
    if(slug && !devs.some(d => d.slug === slug)) devs.push({ slug, name: H.titleCaseName(p.developer) });
  });
  const devLinks = devs.length
    ? ` Projects by developer: ${listText(devs.slice(0, 6).map(d => link(`developers/${d.slug}/`, d.name)))} (${link("developers/", "all developers")}).`
    : "";

  const html = `
<section id="guide" class="home-guide" aria-labelledby="guideTitle">
  <div class="container">
    <div class="section-head">
      <div>
        <div class="section-kicker">Buyer's Guide</div>
        <h2 class="section-title" id="guideTitle">New Residential Projects in ${e(place)}</h2>
      </div>
    </div>
    <p class="home-guide-intro">${e(introText(H, s, place))}</p>
    <p class="home-guide-links">${browse}${sizeLinks}${devLinks}</p>
    <h3>Frequently Asked Questions</h3>
    <div class="hub-faqs">${questions.map(f => `
      <details class="hub-faq">
        <summary>${e(f.q)}</summary>
        <p>${e(f.a)}</p>
      </details>`).join("")}
    </div>
  </div>
</section>`;
  return { html, faqs: questions };
}

function buildHomepage(indexPath, rows, supabaseUrl){
  let html = fs.readFileSync(indexPath, "utf8");
  const H = loadHomepageFunctions(html, supabaseUrl);

  /* Same order and filters as the live page: newest published first. */
  const props = rows.map(row => H.mapResidentialProject(row));

  html = replaceBetween(html, "newlaunches",
    props.filter(p => p.is_new_launch).slice(0, H.NEW_LAUNCH_COUNT)
      .map(p => H.createPropertyCard(p, "New Launch", "st-new-launch")).join(""));
  html = replaceBetween(html, "popular",
    props.slice(0, H.POPULAR_COUNT).map(p => H.createPropertyCard(p)).join(""));
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
      (stats.types[key] ? `href="projects/search?type=${key}">` : `aria-disabled="true">`));

  html = applyHomepageSeo(H, html, props);

  const guide = buildGuide(H, props);
  html = replaceBetween(html, "guide", guide.html);
  const faqLd = guide.faqs.length ? `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))
  }).replace(/</g, "\\u003c")}</script>` : "";
  html = replaceBetween(html, "faqld", faqLd);

  fs.writeFileSync(indexPath, html);
  return { projects: props.length, stats };
}

module.exports = { buildHomepage, loadHomepageFunctions };

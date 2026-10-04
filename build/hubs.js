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

const fs = require("fs");
const path = require("path");
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

/* Carpet-area price per sq ft of a set of flats, as on the project
   page (js/project-core.js): "₹ 6,200 – 7,450 / Sq.Ft", or "". */
const SQFT_PER_SQM = 10.7639;
function rateRange(H, options){
  const rates = options.map(o => {
    if(o.unitPrice) return o.unit === " / Sq.M" ? o.unitPrice / SQFT_PER_SQM : o.unitPrice;
    const price = H.getNumericPrice(o);
    if(price === null) return null;
    const area = parseFloat(o.sqft);
    if(!(area > 0)) return null;
    return price / (o.areaUnit === "Sq.M" ? area * SQFT_PER_SQM : area);
  }).filter(r => r).map(r => Math.round(r / 10) * 10);
  if(!rates.length) return "";
  const lo = Math.min(...rates), hi = Math.max(...rates);
  return hi > lo
    ? `₹ ${lo.toLocaleString("en-IN")} – ${hi.toLocaleString("en-IN")} / Sq.Ft`
    : `₹ ${lo.toLocaleString("en-IN")} / Sq.Ft`;
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

  const rateText = rateRange(H, options);

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

/* ---------- Budget pages: /projects/<city>/flats-under-<n>-<lakh|crore>/ ----------
   "Flats under 50 lakh in Pune" is how buyers with a fixed budget
   search. A project qualifies when at least one of its flats has a
   total price within the budget; price-on-request and per-sq-ft
   rates do not count. The copy quotes the in-budget flats only. */

const BUDGETS = [3000000, 5000000, 7500000, 10000000, 15000000, 20000000, 30000000, 50000000];

function budgetLabel(limit){
  return limit >= 10000000
    ? `₹ ${limit / 10000000} Crore`
    : `₹ ${limit / 100000} Lakh`;
}

function budgetSlug(limit){
  const amount = limit >= 10000000 ? `${limit / 10000000}-crore` : `${limit / 100000}-lakh`;
  return "flats-under-" + amount.replace(".", "-");
}

function optionsWithin(H, p, limit){
  return H.getBhkOptions(p).filter(o => {
    const price = H.getNumericPrice(o);
    return price !== null && price <= limit;
  });
}

/* Each budget that has projects, smallest first. A budget whose
   projects are exactly those of the budget below it would be a copy
   of that page, so it is left out. */
function budgetGroups(H, props){
  const groups = [];
  let previous = "";
  BUDGETS.forEach(limit => {
    const matches = props
      .map(p => ({ p, options: optionsWithin(H, p, limit) }))
      .filter(m => m.options.length)
      .sort((a, b) => Math.min(...a.options.map(H.getNumericPrice)) - Math.min(...b.options.map(H.getNumericPrice)));
    const key = matches.map(m => m.p.id).sort().join(",");
    if(!matches.length || key === previous) return;
    previous = key;
    groups.push({ limit, label: `Under ${budgetLabel(limit)}`, slug: budgetSlug(limit), props: matches.map(m => m.p), options: matches.flatMap(m => m.options) });
  });
  return groups;
}

/* RBI caps a home loan at 90% of the property's value for loans up
   to ₹ 30 Lakh, 80% up to ₹ 75 Lakh and 75% above that. */
function minDownPayment(price){
  if(price * 0.9 <= 3000000) return 0.10;
  if(price * 0.8 <= 7500000) return 0.20;
  return 0.25;
}

function budgetCopy(H, hub){
  const city = hub.cityName;
  const budget = budgetLabel(hub.budget);
  const n = hub.props.length;
  const options = hub.budgetOptions;
  const prices = options.map(o => H.getNumericPrice(o));
  const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
  const bhks = [...new Set(options.map(o => H.normaliseBhkType(o.type)).filter(b => BHK_LABEL.test(b)))]
    .sort((a, b) => bhkSortKey(a) - bhkSortKey(b));
  const localities = [...new Set(hub.props.map(p => H.titleCaseName(p.locality)).filter(Boolean))];
  const developers = [...new Set(hub.props.map(p => H.titleCaseName(p.developer)).filter(Boolean))];
  const names = hub.props.map(p => p.project_name).filter(Boolean);
  const projects = plural(n, "new project", "new projects");
  const priceRange = maxPrice > minPrice ? `from ${H.formatPrice(minPrice)} to ${H.formatPrice(maxPrice)}` : `at ${H.formatPrice(minPrice)}`;
  const down = minDownPayment(hub.budget);

  const intro = [
    `Explore ${projects} in ${city} with flats priced under ${budget} on Keys99.`,
    `Flats within this budget are priced ${priceRange}.`,
    bhks.length ? `Sizes available: ${listText(bhks)}.` : "",
    localities.length ? `Available in ${listText(localities, 5)}.` : "",
    developers.length ? `Developers include ${listText(developers, 4)}.` : ""
  ].filter(Boolean).join(" ");

  const questions = [{
    q: `Which new projects in ${city} have flats under ${budget}?`,
    a: `Keys99 lists ${projects} in ${city} with flats under ${budget}: ${listText(names, 8)}.`
  }];
  if(bhks.length){
    questions.push({
      q: `Which BHK flats can I buy under ${budget} in ${city}?`,
      a: `Within ${budget} you can choose from ${listText(bhks)} flats in new projects in ${city}.`
    });
  }
  if(localities.length){
    questions.push({
      q: `Which localities in ${city} have flats under ${budget}?`,
      a: `Flats under ${budget} are available in ${listText(localities)}.`
    });
  }
  questions.push({
    q: `How much down payment do I need for a ${budget} flat?`,
    a: `RBI rules let banks lend up to 90% of a home's value for loans up to ₹ 30 Lakh, 80% for loans up to ₹ 75 Lakh and 75% above that. For a ${budget} flat, plan for a down payment of at least ${Math.round(down * 100)}% (${H.formatPrice(hub.budget * down)}), plus stamp duty and registration charges, which banks do not fund.`
  });

  return {
    title: `Flats under ${budget} in ${city} | ${bhks.length ? listText(bhks.map(b => b.replace(/ BHK$/, "")), 4) + " BHK" : "New Projects"} | Keys99`,
    intro,
    questions,
    facts: [
      ["Projects", String(n)],
      ["Starting from", H.formatPrice(minPrice)],
      bhks.length ? ["Configurations", bhks.join(", ")] : null,
      localities.length ? ["Localities", String(localities.length)] : null
    ].filter(Boolean)
  };
}

/* ---------- Status pages: /projects/<city>/<status>/ ----------
   "Ready to move flats in Pune", "new launch projects in Pune" and
   the like. One page per status the city has projects in. */

const STATUS_PAGES = [
  {
    slug: "new-launch-projects",
    noun: "a new launch flat",
    label: "New Launch Projects",
    match: p => p.is_new_launch,
    about: "A new launch has just opened for booking. Buyers usually get the widest choice of floors and units at launch-phase prices, with possession several years away."
  },
  {
    slug: "upcoming-projects",
    noun: "a flat in an upcoming project",
    label: "Upcoming Projects",
    match: p => p.status_key === "upcoming",
    about: "Upcoming projects are announced but not yet open for booking. Enquire early to hear about launch prices and the first units released."
  },
  {
    slug: "under-construction-projects",
    noun: "an under-construction flat",
    label: "Under Construction Projects",
    match: p => p.status_key === "under_construction",
    about: "Under-construction homes are usually priced below ready homes, with payments spread over construction milestones. Check the RERA possession date and the building's progress before you book."
  },
  {
    slug: "ready-to-move-flats",
    noun: "a ready-to-move flat",
    label: "Ready to Move Flats",
    match: p => p.status_key === "ready_to_move" || p.status_key === "completed",
    about: "Ready-to-move homes are complete, so you can inspect the actual flat and move in soon after registration. No GST is charged on a flat bought after the occupancy certificate is issued."
  },
  {
    slug: "resale-flats",
    noun: "a resale flat",
    label: "Resale Flats",
    match: p => p.is_resale,
    about: "Resale flats are bought from an existing owner, so you can see the finished home and the society. Check the title, the society's NOC and any pending dues before paying a token amount."
  }
];

function statusGroups(props){
  return STATUS_PAGES
    .map(s => ({ ...s, props: props.filter(s.match) }))
    .filter(s => s.props.length);
}

function statusCopy(H, hub){
  const city = hub.cityName;
  const label = hub.statusLabel;
  const lower = label.toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  const n = hub.props.length;
  const s = summarise(H, hub.props);
  const localities = [...new Set(hub.props.map(p => H.titleCaseName(p.locality)).filter(Boolean))];
  const names = hub.props.map(p => p.project_name).filter(Boolean);
  const possession = [...new Set(hub.props.map(p => p.possession).filter(Boolean))]
    .sort((a, b) => new Date("1 " + a) - new Date("1 " + b));
  const priceRange = s.minPrice === null ? ""
    : s.maxPrice > s.minPrice ? `from ${H.formatPrice(s.minPrice)} to ${H.formatPrice(s.maxPrice)}` : `from ${H.formatPrice(s.minPrice)}`;

  const intro = [
    `Explore ${plural(n, lower.replace(/s$/, ""), lower)} in ${city} on Keys99.`,
    s.bhks.length ? `Configurations available: ${listText(s.bhks)}.` : "",
    priceRange ? `Prices ${s.maxPrice > s.minPrice ? "range" : "start"} ${priceRange}.` : "",
    localities.length ? `Available in ${listText(localities, 5)}.` : "",
    s.developers.length ? `Developers include ${listText(s.developers, 4)}.` : "",
    /* Only when every project has a date, or one date would read
       as the possession of them all. */
    possession.length && hub.props.every(p => p.possession) && hub.statusSlug !== "ready-to-move-flats" && hub.statusSlug !== "resale-flats"
      ? `Possession ${possession.length > 1 ? `from ${possession[0]} to ${possession[possession.length - 1]}` : possession[0]}.` : ""
  ].filter(Boolean).join(" ");

  const questions = [{
    q: `Which ${lower} are there in ${city}?`,
    a: `Keys99 lists ${plural(n, lower.replace(/s$/, ""), lower)} in ${city}: ${listText(names, 8)}.`
  }];
  if(priceRange){
    questions.push({
      q: `What is the price of ${lower} in ${city}?`,
      a: `${sentence} in ${city} are priced ${priceRange}, depending on the project and configuration.`
    });
  }
  if(localities.length){
    questions.push({
      q: `Which localities in ${city} have ${lower}?`,
      a: `${sentence} are available in ${listText(localities)}.`
    });
  }
  questions.push({ q: `What should I know before buying ${hub.statusNoun}?`, a: hub.about });

  return {
    title: `${label} in ${city} | Prices & Floor Plans | Keys99`,
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

/* Budget and status pages of one city, with paths, skipping any
   slug a locality already uses. Shared with the homepage guide. */
function cityFilterPages(H, citySlug, props, takenSlugs){
  const keep = page => {
    if(!takenSlugs || !takenSlugs.has(page.slug)) return true;
    console.warn(`  skipped  /projects/${citySlug}/${page.slug}/: a locality already uses that slug`);
    return false;
  };
  const withPath = page => ({ ...page, path: `${citySlug}/${page.slug}`, count: page.props.length });
  return {
    budgets: budgetGroups(H, props).filter(keep).map(withPath),
    statuses: statusGroups(props).filter(keep).map(withPath)
  };
}

/* ---------- Locality guides: content/localities/<city>/<locality>.html ----------
   Hand-written text about living in a locality (connectivity,
   landmarks, who it suits), shown on that locality's page under the
   projects. <details><summary>Question</summary><p>Answer</p></details>
   blocks become FAQs (and FAQPage JSON-LD). A file whose comment says
   "status: draft" is shown but does not make the page indexable; once
   the facts are checked, delete that line. */
function loadLocalityGuides(dir){
  const guides = new Map();
  if(!fs.existsSync(dir)) return guides;
  fs.readdirSync(dir).forEach(city => {
    const cityDir = path.join(dir, city);
    if(!fs.statSync(cityDir).isDirectory()) return;
    fs.readdirSync(cityDir).filter(f => f.endsWith(".html")).forEach(file => {
      const raw = fs.readFileSync(path.join(cityDir, file), "utf8");
      const $ = cheerio.load(raw, null, false);
      const text = el => $(el).text().replace(/\s+/g, " ").trim();
      const faqs = $("details").map((_, d) => {
        const q = text($(d).find("summary"));
        $(d).find("summary").remove();
        return { q, a: text(d) };
      }).get().filter(f => f.q && f.a);
      $("details").remove();
      $.root().contents().filter((_, n) => n.type === "comment").remove();
      guides.set(`${city}/${file.replace(/\.html$/, "")}`, {
        html: $.html().trim(),
        faqs,
        reviewed: !/<!--[\s\S]*?status:\s*draft[\s\S]*?-->/i.test(raw)
      });
    });
  });
  return guides;
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
    /* The font preload and stylesheet (marked data-fonts in index.html). */
    fonts: $("link[data-fonts]").map((_, el) => $.html($(el).clone().removeAttr("data-fonts"))).get().join("\n")
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
  const copy = hub.bhk ? bhkCopy(H, hub)
    : hub.budget ? budgetCopy(H, hub)
    : hub.statusSlug ? statusCopy(H, hub)
    : hub.copy ? hub.copy(H, s) : null;
  const title = copy ? copy.title : pageTitle(H, s, hub.place);
  const intro = copy ? copy.intro : introText(H, s, hub.place, hub.introExtra);
  const description = metaDescription(intro);
  const questions = [...(copy ? copy.questions : faqs(H, s, hub.place)), ...(hub.guide ? hub.guide.faqs : [])];
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
    s.developers.length ? ["Developers", String(s.developers.length)] : null,
    hub.rateText ? ["Price / Sq.Ft", hub.rateText] : null
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
<meta name="robots" content="${robots(hub.indexCount || hub.props.length, !!hub.indexable)}">
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
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/cards.css">
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
      ${hub.about ? `<p class="hub-about">${e(hub.about)}${hub.aboutLink ? ` <a href="${e(hub.aboutLink.href)}">${e(hub.aboutLink.text)}</a>` : ""}</p>` : ""}
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

    ${hub.guide ? `
    <section class="hub-section hub-guide" aria-labelledby="hubGuide">
      <h2 class="section-title" id="hubGuide">${e(hub.guideHeading)}</h2>
      ${hub.guide.html}
    </section>` : ""}

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

    ${(hub.linkGroups || []).filter(g => g.links.length).map((g, i) => `
    <section class="hub-section" aria-labelledby="hubLinks${i}">
      <h2 class="section-title" id="hubLinks${i}">${e(g.heading)}</h2>
      <div class="hub-localities">
        ${g.links.map(l => `
        <a class="locality-chip" href="projects/${e(l.path)}/">
          <strong>${e(l.label)}</strong>
          <span class="count">${plural(l.count, "Project", "Projects")}</span>
        </a>`).join("")}
      </div>
    </section>`).join("")}

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

<script defer src="js/cards.js"></script>
<script defer src="js/hub.js"></script>
<script defer src="js/nav-fx.js"></script>
<script defer src="js/attribution.js"></script>
<script defer src="js/compare-tray.js"></script>
</body>
</html>
`;

  const $ = cheerio.load(html);
  rebase($, prefix);
  return { base, path: hub.path, dir: dirPath, html: $.html(), lastmod: hub.lastmod, count: hub.indexCount || hub.props.length, indexable: !!hub.indexable };
}

/* Group mapped projects into city and locality hubs. */
function collectHubs(H, props, reservedSlugs, guides){
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

    const filters = cityFilterPages(H, city.slug, city.props, new Set(city.localities.keys()));
    const budgetLinks = filters.budgets.map(b => ({ path: b.path, label: b.label, count: b.count }));
    const statusLinks = filters.statuses.map(st => ({ path: st.path, label: st.label, count: st.count }));
    const linkGroups = (current, budgetHeading, statusHeading) => [
      { heading: budgetHeading, links: budgetLinks.filter(l => l.path !== current) },
      { heading: statusHeading, links: statusLinks.filter(l => l.path !== current) }
    ];

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
      linkGroups: linkGroups("", `Flats by Budget in ${city.name}`, `Projects by Status in ${city.name}`),
      lastmod: latest(city.props)
    });

    filters.budgets.forEach(b => {
      hubs.push({
        path: b.path,
        place: city.name,
        cityName: city.name,
        budget: b.limit,
        budgetOptions: b.options,
        h1: `Flats under ${budgetLabel(b.limit)} in ${city.name}`,
        kicker: `${b.label} · ${city.name}`,
        listHeading: `New Projects with Flats ${b.label} in ${city.name}`,
        crumbs: [{ name: city.name, path: city.slug }, { name: `Flats ${b.label}`, path: b.path }],
        props: b.props,
        about: `Prices shown are the starting prices of each flat; the final price depends on the floor, view and car parking.`,
        aboutLink: { href: "home-loans", text: `Work out the EMI on a ${budgetLabel(b.limit)} home →` },
        linkGroups: linkGroups(b.path, `Other Budgets in ${city.name}`, `Projects by Status in ${city.name}`),
        bhkLinks: bhkPages,
        lastmod: latest(b.props)
      });
    });

    filters.statuses.forEach(st => {
      hubs.push({
        path: st.path,
        place: city.name,
        cityName: city.name,
        statusSlug: st.slug,
        statusLabel: st.label,
        statusNoun: st.noun,
        h1: `${st.label} in ${city.name}`,
        kicker: `${st.label} · ${city.name}`,
        listHeading: `${st.label} in ${city.name}`,
        crumbs: [{ name: city.name, path: city.slug }, { name: st.label, path: st.path }],
        props: st.props,
        about: st.about,
        linkGroups: linkGroups(st.path, `Flats by Budget in ${city.name}`, `Other Project Types in ${city.name}`),
        bhkLinks: bhkPages,
        localities,
        lastmod: latest(st.props)
      });
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
        linkGroups: linkGroups(b.path, `Flats by Budget in ${city.name}`, `Projects by Status in ${city.name}`),
        localities,
        lastmod: latest(b.props)
      });
    });

    localities.forEach(l => {
      const guide = guides && guides.get(l.path);
      hubs.push({
        guide,
        guideHeading: `Living in ${l.name}, ${city.name}`,
        /* A checked guide is real content, so the page is worth
           indexing even with a single project. */
        indexable: !!(guide && guide.reviewed),
        rateText: rateRange(H, l.props.flatMap(p => H.getBhkOptions(p))),
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

function buildHubs({ H, indexHtml, props, rows, reservedSlugs, siteOrigin, robots, shareImageFor, defaultShareImage, guides }){
  const chrome = homepageChrome(indexHtml);
  const ctx = { H, chrome, siteOrigin, robots, shareImageFor, defaultShareImage };
  const hubs = collectHubs(H, props, reservedSlugs, guides);
  (guides || new Map()).forEach((guide, key) => {
    if(!hubs.some(h => h.path === key)) console.warn(`  unused   content/localities/${key}.html: no published project in that locality`);
    else if(!guide.reviewed) console.log(`  draft    content/localities/${key}.html: shown, but the page stays out of the index until checked`);
  });
  return [...hubs, ...collectDeveloperHubs(H, props, rows)]
    .map(hub => hubPage(ctx, hub));
}

module.exports = { buildHubs, loadLocalityGuides, cityFilterPages, homepageChrome, rebase, joinPath, summarise, introText, faqs, listText, bhkSlug, bhkLabelsOf };

#!/usr/bin/env node
/* =========================================================
   KEYS99 - STATIC PAGE GENERATOR

   Writes one page per published project to
   projects/<slug>/index.html, with the content, title, meta
   description, canonical URL, Open Graph tags and JSON-LD already
   in the HTML, plus sitemap.xml.

   Usage
     node build/generate.js                 read live data from Supabase
     node build/generate.js --data rows.json  read rows from a file
                                              (same shape as the API)

   Environment (all optional)
     SUPABASE_URL, SUPABASE_ANON_KEY  default: values in js/config.js
     SITE_ORIGIN                      default: https://keys99.com
     SITE_INDEXABLE=true              let search engines index the
                                      pages. Leave unset until launch.
========================================================= */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const P = require("../js/project-core.js");
const { buildHomepage, loadHomepageFunctions } = require("./homepage.js");
const { buildThumbs } = require("./thumbs.js");
const { buildHubs, loadLocalityGuides, joinPath } = require("./hubs.js");
const { buildSearchPage } = require("./search.js");
const { buildLegalPages } = require("./legal.js");
const { buildBlog, buildPostFallback } = require("./blog.js");
const { buildComparePage } = require("./compare.js");
const { buildComparisons } = require("./compare-pages.js");
const { buildSavedPage, buildProfilePage, buildReelsPage } = require("./extra-pages.js");
const { collectFooterLinks, injectFooterLinks } = require("./footer-links.js");
const { stampAssetVersions, htmlFiles } = require("./asset-versions.js");

/* City/locality hubs with a single project are thin; they are built
   (the homepage links to them) but kept out of the index and the
   sitemap until they list at least this many projects - or, for a
   locality, until it has a checked guide (content/localities/). */
const HUB_MIN_INDEXED = 2;

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "projects", "property-details.html");
/* Each top-level folder of generated pages keeps a list of what the
   last build wrote there, so pages that disappear can be removed. */
const manifestFor = base => path.join(ROOT, base, ".generated.json");

const SITE_ORIGIN = (process.env.SITE_ORIGIN || "https://keys99.com").replace(/\/+$/, "");
/* Pages are indexable by default. SITE_INDEXABLE=false holds a build
   back (every page noindex,nofollow), e.g. for a staging copy. */
const INDEXABLE = process.env.SITE_INDEXABLE !== "false";
const ROBOTS = INDEXABLE ? "index,follow,max-image-preview:large" : "noindex,nofollow";
/* Where the files are actually served. Link-preview images (og:image)
   must load from a working address. A staging copy may set ASSET_ORIGIN
   to its own address; an indexable build always uses SITE_ORIGIN, so a
   leftover value (github.io, pages.dev) never ends up in og:image.
   Canonical URLs, the sitemap and structured data always use SITE_ORIGIN. */
if(INDEXABLE && process.env.ASSET_ORIGIN && process.env.ASSET_ORIGIN.replace(/\/+$/, "") !== SITE_ORIGIN){
  console.warn(`  warning  ASSET_ORIGIN (${process.env.ASSET_ORIGIN}) ignored: this build is indexable, so images use ${SITE_ORIGIN}`);
}
const ASSET_ORIGIN = (INDEXABLE ? SITE_ORIGIN : (process.env.ASSET_ORIGIN || SITE_ORIGIN)).replace(/\/+$/, "");
const DEFAULT_SHARE_IMAGE = `${ASSET_ORIGIN}/assets/og-default.jpg`;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;


/* ---------------- CONFIG ---------------- */

function readConfig(){
  const src = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
  const pick = name => {
    const m = src.match(new RegExp("const " + name + "\\s*=\\s*\"([^\"]+)\""));
    return m ? m[1] : "";
  };
  return {
    url: (process.env.SUPABASE_URL || pick("SUPABASE_URL")).replace(/\/+$/, ""),
    key: process.env.SUPABASE_ANON_KEY || pick("SUPABASE_ANON_KEY")
  };
}


/* ---------------- DATA ---------------- */

/* Published projects of one kind: "residential" (residential_projects)
   or "commercial" (commercial_projects). Commercial rows are stamped
   __kind = "commercial" so every later step (normalizeProject, the
   card mapper, page paths) can tell them apart. */
async function fetchProjects(config, kind){
  const K = P.kindOf(kind);
  const select = K.select.replace(/\s+/g, "");
  const pageSize = 500;
  const rows = [];

  for(let from = 0; ; from += pageSize){
    const url = `${config.url}/rest/v1/${K.table}`
      + `?select=${encodeURIComponent(select)}`
      + `&moderation_status=eq.published&deleted_at=is.null`
      + `&order=published_at.desc.nullslast,id.asc`;

    const res = await fetch(url, {
      headers: {
        apikey: config.key,
        Authorization: "Bearer " + config.key,
        Range: `${from}-${from + pageSize - 1}`,
        "Range-Unit": "items"
      }
    });
    if(!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    const batch = await res.json();
    rows.push(...batch);
    if(batch.length < pageSize) break;
  }
  return stampKind(rows, K.kind);
}

function stampKind(rows, kind){
  if(kind === "commercial") rows.forEach(r => { if(r) r.__kind = "commercial"; });
  return rows;
}

function readDataFile(file){
  const data = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if(!Array.isArray(data)) throw new Error("--data file must hold a JSON array of project rows");
  return data;
}


/* ---------------- PAGE ---------------- */

const SKIP_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/* The template sits in projects/ and links relative to that;
   a generated page sits one folder deeper. A commercial page sits as
   deep, but under commercial/, so its links go through ../../projects/
   and are tidied ("../../projects/../css/x" -> "../../css/x"). */
function rebaseLinks($, kind){
  const commercial = kind === "commercial";
  $("[href], [src]").each((_, el) => {
    ["href", "src"].forEach(attr => {
      const v = $(el).attr(attr);
      if(v && !SKIP_URL.test(v)) $(el).attr(attr, commercial ? fromProjects("../../projects/", v) : joinPath("../", v));
    });
  });
}

/* A link written relative to projects/, re-pointed from a page whose
   way back to projects/ is `prefix`; query and hash kept. */
function fromProjects(prefix, v){
  const m = v.match(/^([^?#]*)(.*)$/);
  let p = path.posix.normalize(prefix + m[1]);
  if(m[1].endsWith("/") && !p.endsWith("/")) p += "/";
  return p + m[2];
}

/* Wording that differs for commercial projects, on the generated
   pages and the commercial fallback page alike. */
function applyKindLabels($, kind){
  if(kind !== "commercial") return;
  $("#miniBreadcrumb").text("Commercial");
  $("#bhk").prev("small").text("Unit Types");
  $("#configurationSection thead tr").html("<th>Unit Type</th><th>Price / Rent</th><th>Carpet Area</th><th>Furnishing</th><th>Status</th>");
  $("#configurationSection > h2").html("<i></i>Units &amp; Prices");
  ["#towersSection", "#phasesSection"].forEach(sel => $(sel).find("th").each((_, th) => {
    if($(th).text() === "Configurations") $(th).text("Unit Types");
  }));
  $("#enquiryBhk option[value='']").text("Select Unit Type *");
  $("#gateBhkField > span").text("Unit Type *");
}

/* The template's own links point at the residential site (Buy/Rent go to
   projects/search, the footer lists residential cities). A commercial page
   has its own: Buy/Rent go to the sale and lease sections of /commercial/,
   the bottom-bar search to /commercial/, and the static footer block is
   dropped (build/footer-links.js adds the commercial one). Links are
   template-relative (projects/), as rebaseLinks() expects. */
function commercialLinks($){
  $('a[href="search?status=sale"]').attr("href", "../commercial/#hubRow-sale");
  $('a[href="search?status=rent"]').attr("href", "../commercial/#hubRow-lease");
  $("#footer .footer-links").remove();
  $("#footer *").contents().filter((_, n) => n.type === "comment" && /footer-links:/.test(n.data)).remove();
}

function setMeta($, selector, attr, value){
  const el = $(selector);
  if(el.length) el.attr(attr, value);
}

function toggle($, selector, show){
  $(selector).toggleClass("hidden", !show);
}

function buildPage(template, row, config, allProjects, shareImage, similarCards, hubLinks, compareLinks){
  const p = P.normalizeProject(row, { supabaseUrl: config.url, root: "../" });   // template-relative; rebaseLinks() adds the extra ../
  const K = P.kindOf(p.kind);
  const commercial = K.kind === "commercial";
  /* Template-relative (projects/) way to this kind's own pages. */
  const own = commercial ? "../commercial/" : "";
  const pageUrl = `${SITE_ORIGIN}/${K.base}/${p.slug}/`;
  const title = P.pageTitle(p);
  const description = P.pageDescription(p);
  const ogCopy = p.images.length && shareImage ? shareImage(p.images[0].url) : null;
  const image = ogCopy || (p.images.length ? p.images[0].url : DEFAULT_SHARE_IMAGE);

  const $ = cheerio.load(template);

  /* ---- head ---- */
  $("title").text(title);
  setMeta($, 'meta[name="description"]', "content", description);
  setMeta($, 'link[rel="canonical"]', "href", pageUrl);
  $('meta[name="robots"]').attr("content", ROBOTS);
  $("head").contents().filter((_, n) => n.type === "comment" && /Template \/ fallback page/.test(n.data)).remove();
  setMeta($, 'meta[property="og:title"]', "content", title);
  setMeta($, 'meta[property="og:description"]', "content", description);
  setMeta($, 'meta[property="og:url"]', "content", pageUrl);
  setMeta($, 'meta[property="og:image"]', "content", image);
  if(ogCopy){
    $('meta[property="og:image"]').after(
      `\n<meta property="og:image:type" content="image/jpeg">` +
      `\n<meta property="og:image:width" content="${P.OG_SIZE.width}">` +
      `\n<meta property="og:image:height" content="${P.OG_SIZE.height}">` +
      `\n<meta property="og:image:alt" content="${P.escapeHtml(p.name)}">`);
  }
  setMeta($, 'meta[name="twitter:title"]', "content", title);
  setMeta($, 'meta[name="twitter:description"]', "content", description);
  setMeta($, 'meta[name="twitter:image"]', "content", image);

  $("head").append(`\n<script type="application/ld+json">${P.structuredData(p, pageUrl, SITE_ORIGIN)}</script>\n`);

  /* The page script renders from this row immediately and only
     refreshes it from Supabase. */
  const boot = `window.__KEYS99_ROOT__="../../";window.__KEYS99_SLUG__=${JSON.stringify(p.slug)};`
    + (commercial ? `window.__KEYS99_KIND__="commercial";` : "")
    + `window.__KEYS99_PROJECT__=${JSON.stringify(row).replace(/</g, "\\u003c")};`;
  /* Prefix match: the link may carry a ?v= version (asset-versions.js). */
  const configScript = $('script[src^="../js/config.js"]');
  if(!configScript.length) throw new Error("projects/property-details.html no longer loads ../js/config.js");
  configScript.first().before(`<script>${boot}</script>\n  `);

  /* ---- body: same fields renderProject() fills in the browser ---- */
  /* The content is in the page, so the loading screen and the "Project
     not found" box are never shown here (js/property-details.js only
     uses them when there is no embedded project). They stay as empty
     elements for the script, without text, so crawlers never read a
     loading message or a "not found" heading as part of a real
     project page - a soft-404 signal. */
  $("#loading").addClass("hidden").empty();
  $("#errorBox").empty();
  $("#propertyPage").removeClass("hidden");

  $("#propertyName").text(p.name);
  $("#crumbName").text(p.name);
  const citySlug = P.slugify(p.city), localitySlug = P.slugify(p.locality);
  [["#crumbCity", p.city, citySlug], ["#crumbLocality", p.locality, citySlug && localitySlug ? `${citySlug}/${localitySlug}` : ""]].forEach(([sel, text, hubPath]) => {
    $(sel).text(text);
    if(hubPath) $(sel).attr("href", `${own}${hubPath}/`);   // template links are relative to projects/
    toggle($, sel, !!text);
    toggle($, sel + "Sep", !!text);
  });
  applyKindLabels($, K.kind);
  if(commercial) commercialLinks($);
  $("#miniBreadcrumb").text([p.typeLabel, p.transactionLabel].filter(Boolean).join(" · "));
  $("#propertyType").text(p.typeLabel);
  $("#developer").text(p.developer || "—");
  $("#developerName").text(p.developer || "—");
  $("#developerDescription").text(p.developerDescription);
  toggle($, "#developerSection", !!p.developer);
  toggle($, ".developer-line", !!p.developer);
  $("#propertyLocation").text("⌖ " + ([p.address, p.location].filter(Boolean).join(", ") || "Location not available"));
  $("#mapLocation").text(p.location || "Project Location");
  $("#statusBadge").text(p.status);
  toggle($, "#statusBadge", !!p.status);
  if(p.statusClass) $("#statusBadge").addClass(p.statusClass);
  $("#propertyPrice").text(p.startingPriceText);
  toggle($, "#priceNote", !!p.startingPrice);
  $("#priceDisclaimer").text(p.priceDisclaimer);
  toggle($, "#priceDisclaimer", !!p.priceDisclaimer);
  $("#priceUpdated").text(p.pricesUpdatedText ? "Prices updated " + p.pricesUpdatedText : "");
  toggle($, "#priceUpdated", !!p.pricesUpdatedText);
  $("#bhk").text(p.bhkLabels.length ? p.bhkLabels.join(" / ") : "—");
  $("#carpetArea").text(p.firstArea || "—");
  $("#possession").text(p.possession || (p.status === "Ready to Move" ? "Ready" : "—"));
  $("#description").text(p.overview || "Project description will be available soon.");
  $("#metaLine").text(p.reraNumbers.length ? "RERA: " + p.reraNumbers.join(", ") : "");
  if(p.rera) $("#reraBadge").removeAttr("hidden");

  if(p.images.length){
    $("#mainImage").attr("src", p.images[0].large).attr("data-full", p.images[0].url)
      .attr("alt", p.images[0].alt || [p.name, p.locality, p.city].filter(Boolean).join(", "));
    $("#galleryThumbs").html(P.renderThumbs(p));
  }else{
    $("#mainPhoto").addClass("no-image");
    $("#mainImage").attr("alt", "No project image available");
  }

  $("#configurationBody").html(P.renderConfigurationRows(p));
  toggle($, "#configurationSection", p.configurations.length > 0);

  [
    ["#highlightsSection", "#highlights", P.renderHighlights(p)],
    ["#factsSection", "#facts", P.renderFacts(p)],
    ["#floorPlanSection", "#floorPlanGrid", P.renderFloorPlans(p)],
    ["#masterPlanSection", "#masterPlanGrid", P.renderMasterPlans(p)],
    ["#amenitiesSection", "#amenities", P.renderAmenities(p)],
    ["#specsSection", "#specifications", P.renderSpecificationRows(p)],
    ["#towersSection", "#towers", P.renderTowerRows(p)],
    ["#phasesSection", "#phases", P.renderPhaseRows(p)],
    ["#updatesSection", "#updates", P.renderUpdates(p)],
    ["#legalSection", "#legal", P.renderLegal(p)],
    ["#prosConsSection", "#prosCons", P.renderProsCons(p)],
    ["#faqSection", "#faqs", P.renderFaqs(p)],
    ["#blogSection", "#projectBlogs", P.renderBlogs(p)]
  ].forEach(([section, container, html]) => {
    $(container).html(html);
    toggle($, section, !!html.trim());
  });

  /* Section headings name the project ("Amenities at Shuban Enclave"
     rather than "Amenities"), which is how buyers search: "<project>
     price", "<project> floor plan", "<project> amenities". The
     template's generic headings stay for the fallback page. */
  const name = p.name;
  [
    [$("#propertyType").closest("section"), `${name} Overview`],
    [$("#aboutSection"), `About ${name}`],
    [$("#highlightsSection"), `${name} Highlights`],
    [$("#factsSection"), `${name} Project Details`],
    [$("#configurationSection"), commercial ? `${name} Units & Prices` : `${name} Price & Configurations`],
    [$("#floorPlanSection"), `${name} Floor Plans & Pricing`],
    [$("#masterPlanSection"), `${name} Master Plan`],
    [$("#mediaSection"), `${name} Videos`],
    [$("#amenitiesSection"), `Amenities at ${name}`],
    [$("#specsSection"), `${name} Specifications`],
    [$("#towersSection"), `${name} Tower Details`],
    [$("#phasesSection"), `${name} Phases & Possession`],
    [$("#updatesSection"), `${name} Construction Updates`],
    [$("#legalSection"), `${name} RERA & Legal Status`],
    [$("#locationSection"), `${name} Location & Connectivity`],
    [$("#developerSection"), p.developer ? `About ${p.developer}` : ""],
    [$("#prosConsSection"), `${name} Pros & Cons`],
    [$("#faqSection"), `${name} FAQs`]
  ].forEach(([section, text]) => {
    if(text) section.children("h2").first().html(`<i></i>${P.escapeHtml(text)}`);
  });

  /* Videos: titles, thumbnails and links in the HTML. The browser
     swaps in the players (renderMedia() in js/property-details.js). */
  const videos = P.renderVideos(p);
  $("#uploadedVideos").html(videos.uploaded);
  $("#socialVideosWrap").html(videos.social);
  toggle($, "#uploadedVideosWrap", !!videos.uploaded);
  toggle($, "#mediaSection", !!(videos.uploaded || videos.social));

  /* Compare button on the main photo (js/compare-tray.js). */
  $("#compareBtn").attr("data-compare-slug", p.slug).attr("data-compare-name", p.name).removeClass("hidden");
  if(commercial) $("#compareBtn").attr("data-compare-kind", "commercial");

  /* Developer page (build/hubs.js writes /developers/<slug>/ for every
     developer with a published project). Template-relative path. */
  const devSlug = P.slugify(p.developer);
  if(devSlug){
    $("#developerLink").attr("href", `../developers/${devSlug}/`).text(`View all projects by ${p.developer} →`);
    $("#developer").html(`<a href="../developers/${devSlug}/">${P.escapeHtml(p.developer)}</a>`);
  }
  toggle($, "#developerLink", !!devSlug);

  const similar = P.pickSimilar(p, allProjects || [], 4);
  if(similar.length){
    const sameCity = p.city && similar.every(o => o.city === p.city);
    $("#similarTitle").html(`<i></i>Similar Projects${sameCity ? " in " + P.escapeHtml(p.city) : ""}`);
    $("#similarList").html(similarCards(similar));
  }
  toggle($, "#similarSection", similar.length > 0);

  /* Listing pages this project appears on (paths relative to projects/). */
  const explore = (hubLinks || []).slice(0, 8);
  if(explore.length){
    $("#exploreList").html(explore.map(h => `
            <a class="explore-link" href="${own}${P.escapeHtml(h.path)}/">${P.escapeHtml(h.label)}<span>${h.count} project${h.count === 1 ? "" : "s"}</span></a>`).join(""));
  }
  toggle($, "#exploreSection", explore.length > 0);

  /* "Compare with": this project's /compare/<a>-vs-<b>/ pages. */
  const compare = compareLinks || [];
  if(compare.length){
    $("#compareLinks").html(compare.map(c => `
            <a class="explore-link" href="../compare/${P.escapeHtml(c.slug)}/">${P.escapeHtml(p.name)} vs ${P.escapeHtml(c.name)}<span>${P.escapeHtml(c.place)}</span></a>`).join(""));
  }
  toggle($, "#compareLinksSection", compare.length > 0);

  $("#locationAdvantages").html(P.renderNearbyRows(p));
  toggle($, "#locationSection", p.nearby.length > 0 || !!p.location);

  rebaseLinks($, K.kind);

  /* Photos, master plans and floor plans, for the image sitemap
     (Google Images: "<project> photos", "<project> floor plan"). */
  const images = [...p.images, ...p.masterPlans, ...p.floorPlans, ...p.updates.flatMap(u => u.photos)]
    .map(i => i.url).filter(u => /^https?:\/\//i.test(u))
    .filter((u, i, a) => a.indexOf(u) === i).slice(0, 30);

  return { slug: p.slug, base: K.base, city: p.city, html: $.html(), lastmod: p.updatedAt, images };
}


/* ---------------- OUTPUT ---------------- */

function removeStalePages(base, current){
  let previous = [];
  try{ previous = JSON.parse(fs.readFileSync(manifestFor(base), "utf8")); }catch(_){}
  current = current.filter(Boolean);

  /* Entries are paths under the base folder: project slugs and hub
     paths ("pune", "pune/moshi") under projects/, developer slugs
     under developers/. Deepest first, so a city folder is only
     removed once empty. */
  const valid = entry => entry.split("/").every(seg => SLUG_RE.test(seg));
  previous
    .filter(entry => valid(entry) && !current.includes(entry))
    .sort((a, b) => b.split("/").length - a.split("/").length)
    .forEach(entry => {
      const dir = path.join(ROOT, base, ...entry.split("/"));
      const file = path.join(dir, "index.html");
      if(fs.existsSync(file)) fs.unlinkSync(file);
      try{ fs.rmdirSync(dir); }catch(_){}   // only removes the folder if nothing else is in it
      /* A project's last post gone: its empty blog/ folder goes too. */
      if(path.basename(path.dirname(dir)) === "blog"){ try{ fs.rmdirSync(path.dirname(dir)); }catch(_){} }
      console.log(`  removed  /${base}/${entry}/`);
    });

  fs.mkdirSync(path.join(ROOT, base), { recursive: true });
  fs.writeFileSync(manifestFor(base), JSON.stringify(current.sort(), null, 2) + "\n");
}

function writeSitemap(pages, hubs, articles, extra){
  const day = v => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  };
  const urls = [
    { loc: SITE_ORIGIN + "/", lastmod: "" },
    { loc: SITE_ORIGIN + "/about", lastmod: "" },
    { loc: SITE_ORIGIN + "/contact", lastmod: "" },
    { loc: SITE_ORIGIN + "/home-loans", lastmod: "" },
    { loc: SITE_ORIGIN + "/testimonials", lastmod: "" },
    ...(extra || []).map(loc => ({ loc: SITE_ORIGIN + loc, lastmod: "" })),
    ...(hubs || []).filter(h => h.indexable || h.count >= HUB_MIN_INDEXED)
      .map(h => ({ loc: `${SITE_ORIGIN}/${h.dir}/`, lastmod: day(h.lastmod) })),
    ...pages.map(p => ({ loc: `${SITE_ORIGIN}/${p.base || "projects"}/${p.slug}/`, lastmod: day(p.lastmod), images: p.images || [] })),
    ...(articles || []).map(a => ({ loc: `${SITE_ORIGIN}/${a.dir}/`, lastmod: day(a.lastmod), images: a.image ? [a.image] : [] }))
  ];
  const x = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /* Project photos and blog covers are listed as images of their page
     (Google Images). */
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => `  <url>\n    <loc>${x(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}${(u.images || []).map(img => `\n    <image:image><image:loc>${x(img)}</image:loc></image:image>`).join("")}\n  </url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
}


/* ---------------- MAIN ---------------- */

/* Sample testimonials (an element with a data-sample attribute) are
   for reviewing the design only and carry a visible "Sample" tag. They
   used to stop an indexable build; the site is indexable by default
   now, so this only warns - replace them with real buyer reviews (and
   remove each data-sample tag) as soon as you have them. */
function checkSampleTestimonials(){
  const files = ["index.html", path.join("content", "testimonials.html")];
  const withSamples = files.filter(f => /<[a-z][^>]*\sdata-sample[\s>=]/i.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  if(!withSamples.length) return;
  console.warn(`  warning  sample testimonials are live (${withSamples.join(", ")}) - replace them with real buyer reviews`);
}

async function main(){
  checkSampleTestimonials();
  const config = readConfig();
  /* Residential and commercial projects. --data / --commercial-data
     read rows from files instead (local testing); with only --data,
     there are no commercial projects. */
  const dataArg = process.argv.indexOf("--data");
  const commercialArg = process.argv.indexOf("--commercial-data");
  const homeRows = dataArg > -1 ? readDataFile(process.argv[dataArg + 1]) : await fetchProjects(config, "residential");
  const commercialRows = commercialArg > -1 ? stampKind(readDataFile(process.argv[commercialArg + 1]), "commercial")
    : dataArg > -1 ? [] : await fetchProjects(config, "commercial");
  const rows = [...homeRows, ...commercialRows];
  const template = fs.readFileSync(TEMPLATE, "utf8");

  /* Every project that gets a page, for the "Similar Projects" links. */
  const allProjects = rows
    .filter(r => r && SLUG_RE.test(String(r.slug || "")) && r.slug !== "property-details" && r.slug !== "search")
    .map(r => P.normalizeProject(r, { supabaseUrl: config.url, root: "../" }));

  const indexPath = path.join(ROOT, "index.html");
  const goodRows = rows.filter(r => r && SLUG_RE.test(String(r.slug || "")));
  const H = loadHomepageFunctions(fs.readFileSync(indexPath, "utf8"), config.url);
  /* Card data for a row of either kind. */
  const mapProp = row => row.__kind === "commercial" ? H.mapCommercialProject(row) : H.mapResidentialProject(row);
  const allProps = goodRows.map(mapProp);

  /* Resized images first, so pages only point at copies that exist. */
  const thumbs = await buildThumbs({ H, P, props: allProps, rows: goodRows, supabaseUrl: config.url, root: ROOT });
  console.log(`  thumbnails: ${thumbs.made} made, ${thumbs.kept} kept, ${thumbs.removed} removed` +
    (thumbs.failed ? `, ${thumbs.failed} failed (those images use the original photo)` : ""));

  /* Link-preview image for a photo: the 1200x630 JPEG copy, or null if
     it could not be made (the page then keeps its previous image). */
  const shareImage = url => {
    if(!/^https?:\/\//i.test(url || "")) return null;
    const name = P.ogName(url);
    return fs.existsSync(path.join(ROOT, "assets", "thumbs", name)) ? `${ASSET_ORIGIN}/assets/thumbs/${name}` : null;
  };
  const shareById = new Map(allProjects.map(p => [p.id, p.images[0] ? shareImage(p.images[0].url) : null]));

  /* Similar Projects use the homepage's own card (createPropertyCard),
     so they look and behave exactly like the cards everywhere else.
     The card links from the site root; the template sits in projects/
     and rebaseLinks() adds the page's extra ../ to href/src - but not
     to the image fallback in onerror, so that gets the full ../../. */
  const propById = new Map(allProps.map(prop => [prop.id, prop]));
  const similarCards = list => {
    const $c = cheerio.load(`<div>${list.map(o => propById.get(o.id)).filter(Boolean)
      .map(prop => H.createPropertyCard(prop)).join("")}</div>`, null, false);
    $c("[href], [src]").each((_, el) => {
      ["href", "src"].forEach(attr => {
        const v = $c(el).attr(attr);
        if(v && !SKIP_URL.test(v)) $c(el).attr(attr, joinPath("../", v));
      });
    });
    $c("[onerror]").each((_, el) => {
      $c(el).attr("onerror", $c(el).attr("onerror").replace(/'assets\//g, "'../../assets/"));
    });
    return $c("div").first().html();
  };

  /* Rows that get a project page. */
  const buildable = rows.filter(row => {
    if(!row || !SLUG_RE.test(String(row.slug || ""))){
      console.warn(`  skipped  project ${row && row.id}: slug "${row && row.slug}" is not a clean URL slug`);
      return false;
    }
    if(row.slug === "property-details" || row.slug === "search"){
      console.warn(`  skipped  project ${row.id}: slug "${row.slug}" is reserved`);
      return false;
    }
    return true;
  });

  /* Projects with a page, normalised with links from the site root,
     for the blog pages and the hubs' "From the Keys99 Blog" lists. */
  const builtSlugs = new Set(buildable.map(r => r.slug));
  const blogProjects = goodRows.filter(r => builtSlugs.has(r.slug))
    .map(r => P.normalizeProject(r, { supabaseUrl: config.url, root: "" }));
  const postsByProject = new Map(blogProjects.map(p => [p.id, p.blogs.filter(b => b.indexable)
    .map(b => ({ href: b.path, title: b.title, project: p.name, date: b.date }))]));

  /* City + locality hubs, from the same projects. */
  const hubs = buildHubs({
    postsByProject,
    H,
    indexHtml: fs.readFileSync(indexPath, "utf8"),
    props: goodRows.filter(r => r.__kind !== "commercial").map(mapProp),
    rows: goodRows.filter(r => r.__kind !== "commercial"),
    commercialProps: goodRows.filter(r => r.__kind === "commercial").map(mapProp),
    commercialRows: goodRows.filter(r => r.__kind === "commercial"),
    commercialReservedSlugs: new Set([...buildable.filter(r => r.__kind === "commercial").map(r => r.slug), "property-details", "blog-post"]),
    reservedSlugs: new Set([...buildable.filter(r => r.__kind !== "commercial").map(r => r.slug), "property-details", "blog-post", "search"]),
    siteOrigin: SITE_ORIGIN,
    shareImageFor: prop => shareById.get(prop.id) || null,
    defaultShareImage: DEFAULT_SHARE_IMAGE,
    guides: loadLocalityGuides(path.join(ROOT, "content", "localities")),
    robots: (count, indexable) => !INDEXABLE ? "noindex,nofollow"
      : indexable || count >= HUB_MIN_INDEXED ? "index,follow,max-image-preview:large" : "noindex,follow"
  });
  hubs.forEach(hub => {
    const dir = path.join(ROOT, ...hub.dir.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), hub.html);
    console.log(`  wrote    /${hub.dir}/  (${hub.count} project${hub.count === 1 ? "" : "s"})`);
  });

  /* "Explore more" on each project page: the listing pages (locality,
     BHK, budget, status) that include the project and are in the
     sitemap. The city page is already in the breadcrumb. */
  const hubLinksById = new Map();
  hubs.filter(h => (h.base === "projects" || h.base === "commercial") && h.path.includes("/") && (h.indexable || h.count >= HUB_MIN_INDEXED))
    .forEach(h => h.projectIds.forEach(id => {
      if(!hubLinksById.has(id)) hubLinksById.set(id, []);
      hubLinksById.get(id).push({ path: h.path, label: h.label, count: h.count });
    }));

  /* "<A> vs <B>" pages for each project's closest alternatives. */
  const comparisons = buildComparisons({
    indexHtml: fs.readFileSync(indexPath, "utf8"), projects: blogProjects,
    siteOrigin: SITE_ORIGIN, robots: ROBOTS, indexable: INDEXABLE
  });
  comparisons.pages.forEach(page => {
    const dir = path.join(ROOT, ...page.dir.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page.html);
    console.log(`  wrote    /${page.dir}/${page.draft ? "  (missing prices: kept out of the index)" : ""}`);
  });

  const pages = [];
  for(const row of buildable){
    const page = buildPage(template, row, config, allProjects, shareImage, similarCards,
      hubLinksById.get(row.id) || [], comparisons.linksById.get(row.id) || []);
    const dir = path.join(ROOT, page.base, page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page.html);
    pages.push(page);
    console.log(`  wrote    /${page.base}/${page.slug}/`);
  }

  /* Fallback for a commercial project published since the last build
     (404.html sends /commercial/<slug>/ here): the template with the
     commercial wording, its links re-pointed from projects/. */
  {
    const $f = cheerio.load(template);
    applyKindLabels($f, "commercial");
    commercialLinks($f);
    $f('link[rel="canonical"]').attr("href", `${SITE_ORIGIN}/commercial/property-details`);
    $f('meta[property="og:url"]').attr("content", `${SITE_ORIGIN}/commercial/property-details`);
    $f('script[src^="../js/config.js"]').first().before(`<script>window.__KEYS99_KIND__="commercial";</script>\n  `);
    $f("[href], [src]").each((_, el) => {
      ["href", "src"].forEach(attr => {
        const v = $f(el).attr(attr);
        if(v && !SKIP_URL.test(v)) $f(el).attr(attr, fromProjects("../projects/", v));
      });
    });
    fs.mkdirSync(path.join(ROOT, "commercial"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "commercial", "property-details.html"), $f.html());
    console.log("  wrote    /commercial/property-details.html");
  }

  /* Fallback for a project post published since the last build
     (404.html sends projects/<project>/blog/<post>/ here). */
  ["residential", "commercial"].forEach(kind => {
    const base = kind === "commercial" ? "commercial" : "projects";
    fs.mkdirSync(path.join(ROOT, base), { recursive: true });
    fs.writeFileSync(path.join(ROOT, base, "blog-post.html"), buildPostFallback({
      indexHtml: fs.readFileSync(indexPath, "utf8"), siteOrigin: SITE_ORIGIN, defaultShareImage: DEFAULT_SHARE_IMAGE, robots: ROBOTS, kind
    }));
    console.log(`  wrote    /${base}/blog-post.html`);
  });

  fs.writeFileSync(path.join(ROOT, "projects", "search.html"), buildSearchPage({
    H, indexHtml: fs.readFileSync(indexPath, "utf8"), props: allProps, siteOrigin: SITE_ORIGIN, robots: ROBOTS
  }));
  console.log(`  wrote    /projects/search.html  (${allProps.length} projects)`);

  fs.writeFileSync(path.join(ROOT, "projects", "compare.html"), buildComparePage({
    indexHtml: fs.readFileSync(indexPath, "utf8"), siteOrigin: SITE_ORIGIN, robots: ROBOTS
  }));
  console.log("  wrote    /projects/compare.html");

  fs.writeFileSync(path.join(ROOT, "saved.html"), buildSavedPage({
    H, indexHtml: fs.readFileSync(indexPath, "utf8"), props: allProps, siteOrigin: SITE_ORIGIN, robots: ROBOTS
  }));
  console.log("  wrote    /saved.html");

  fs.writeFileSync(path.join(ROOT, "profile.html"), buildProfilePage({
    H, indexHtml: fs.readFileSync(indexPath, "utf8"), props: allProps, siteOrigin: SITE_ORIGIN, robots: ROBOTS
  }));
  console.log("  wrote    /profile.html");

  const reels = buildReelsPage({
    H, P, indexHtml: fs.readFileSync(indexPath, "utf8"), rows: goodRows,
    supabaseUrl: config.url, siteOrigin: SITE_ORIGIN, robots: ROBOTS
  });
  fs.writeFileSync(path.join(ROOT, "reels.html"), reels.html);
  console.log(`  wrote    /reels.html  (${reels.count} videos)`);

  buildLegalPages({ root: ROOT, indexHtml: fs.readFileSync(indexPath, "utf8"), siteOrigin: SITE_ORIGIN, robots: ROBOTS })
    .forEach(page => {
      fs.writeFileSync(path.join(ROOT, page.file), page.html);
      console.log(`  wrote    /${page.file}`);
    });

  /* Blog: the guides in content/blog/ plus every published project
     post (residential_project_blogs), which gets a page under its
     project. Links in these pages are written from the site root. */
  const blog = buildBlog({
    root: ROOT, indexHtml: fs.readFileSync(indexPath, "utf8"), siteOrigin: SITE_ORIGIN,
    robots: ROBOTS, indexable: INDEXABLE, defaultShareImage: DEFAULT_SHARE_IMAGE,
    projects: blogProjects,
    shareImage,
    copyUrl: rel => /^assets\//.test(rel || "") && fs.existsSync(path.join(ROOT, ...rel.split("/"))) ? `${ASSET_ORIGIN}/${rel}` : ""
  });
  blog.projectPages.forEach(page => {
    const dir = path.join(ROOT, ...page.dir.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page.html);
    console.log(`  wrote    /${page.dir}/${page.draft ? "  (short post: kept out of the index)" : ""}`);
  });
  blog.pages.forEach(page => {
    const dir = path.join(ROOT, ...page.dir.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page.html);
    console.log(`  wrote    /${page.dir}/${page.draft ? "  (draft: kept out of the index)" : ""}`);
  });
  /* No articles left: the list page and the feed go too. */
  if(!blog.pages.length) fs.rmSync(path.join(ROOT, "blog", "index.html"), { force: true });
  if(blog.feed && blog.pages.length) fs.writeFileSync(path.join(ROOT, "blog", "feed.xml"), blog.feed);
  else fs.rmSync(path.join(ROOT, "blog", "feed.xml"), { force: true });

  removeStalePages("projects", [
    ...pages.filter(p => p.base === "projects").map(p => p.slug),
    ...hubs.filter(h => h.base === "projects").map(h => h.path),
    ...blog.projectPages.filter(p => /^projects\//.test(p.dir)).map(p => p.dir.replace(/^projects\//, ""))
  ]);
  removeStalePages("commercial", [
    ...pages.filter(p => p.base === "commercial").map(p => p.slug),
    ...hubs.filter(h => h.base === "commercial").map(h => h.path),
    ...blog.projectPages.filter(p => /^commercial\//.test(p.dir)).map(p => p.dir.replace(/^commercial\//, ""))
  ]);
  removeStalePages("developers", hubs.filter(h => h.base === "developers").map(h => h.path));
  removeStalePages("blog", blog.pages.map(p => p.slug));
  removeStalePages("compare", comparisons.pages.map(p => p.slug));
  writeSitemap(pages, hubs, [...blog.pages, ...blog.projectPages, ...comparisons.pages].filter(p => !p.draft), reels.count ? ["/reels"] : []);

  const home = buildHomepage(indexPath, goodRows, config.url, reels.home, SITE_ORIGIN);
  /* Homepage link preview: the brand image, from where the site is served. */
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, "utf8")
    .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(")/g, `$1${DEFAULT_SHARE_IMAGE}$2`));
  console.log(`  wrote    / (homepage sections: ${home.projects} projects, ${home.stats.cities} cities)`);

  /* The homepage and the two project-page templates carry their robots
     tag in the source, so a held-back build (SITE_INDEXABLE=false) has
     to rewrite it there too. */
  ["index.html", path.join("projects", "property-details.html"), path.join("commercial", "property-details.html")].forEach(rel => {
    const file = path.join(ROOT, rel);
    if(!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, "utf8");
    const out = html.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${ROBOTS}">`);
    if(out !== html) fs.writeFileSync(file, out);
  });

  /* Footer links chosen for each page (build/footer-links.js): a page
     about one city links to that city's listing pages, other pages to
     the main cities, and pages that already have the links get none.
     The city of a page comes from its folder: a listing page's own
     city, or the project a project page (or its blog post) is about. */
  const footerData = collectFooterLinks(hubs, h => h.indexable || h.count >= HUB_MIN_INDEXED);
  const cityByDir = new Map();
  hubs.forEach(h => { if(h.footer && h.footer.city) cityByDir.set(h.dir, h.footer.city); });
  pages.forEach(p => { if(p.city) cityByDir.set(`${p.base}/${p.slug}`, p.city); });
  const cityOfDir = dir => {
    const parts = dir.split("/");
    for(let n = parts.length; n > 1; n--){
      const city = cityByDir.get(parts.slice(0, n).join("/"));
      if(city) return city;
    }
    return "";
  };
  const footer = injectFooterLinks(ROOT, [
    indexPath,
    ...["about", "contact", "home-loans", "testimonials", "privacy-policy", "terms", "saved", "profile", "reels"]
      .map(name => path.join(ROOT, name + ".html")),
    ...htmlFiles(ROOT, ["projects", "commercial", "developers", "blog", "compare"])
  ], footerData, cityOfDir);
  console.log(`  footer   city links on ${footer.city} page(s), popular cities on ${footer.cities}, none on ${footer.skipped} (already linked)`);

  /* Last: version every CSS/JS link so browsers never pair new pages
     with old cached styles or scripts. */
  const stamped = stampAssetVersions(ROOT, [
    indexPath,
    path.join(ROOT, "about.html"),
    path.join(ROOT, "contact.html"),
    path.join(ROOT, "home-loans.html"),
    path.join(ROOT, "testimonials.html"),
    path.join(ROOT, "privacy-policy.html"),
    path.join(ROOT, "terms.html"),
    path.join(ROOT, "saved.html"),
    path.join(ROOT, "profile.html"),
    path.join(ROOT, "reels.html"),
    ...htmlFiles(ROOT, ["projects", "commercial", "developers", "blog", "compare", "admin"])
  ]);
  console.log(`  versioned CSS/JS links in ${stamped} page(s)`);

  console.log(`\n  ${pages.length} project page(s), ${blog.projectPages.length} project post(s), ${hubs.length} city/locality page(s), sitemap.xml updated` +
    (INDEXABLE ? "" : "\n  pages are noindex (SITE_INDEXABLE=false)"));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

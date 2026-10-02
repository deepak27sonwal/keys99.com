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
const { buildHubs } = require("./hubs.js");
const { buildSearchPage } = require("./search.js");

/* City/locality hubs with a single project are thin; they are built
   (the homepage links to them) but kept out of the index and the
   sitemap until they list at least this many projects. */
const HUB_MIN_INDEXED = 2;

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "projects", "property-details.html");
const MANIFEST = path.join(ROOT, "projects", ".generated.json");

const SITE_ORIGIN = (process.env.SITE_ORIGIN || "https://keys99.com").replace(/\/+$/, "");
const INDEXABLE = process.env.SITE_INDEXABLE === "true";
const ROBOTS = INDEXABLE ? "index,follow,max-image-preview:large" : "noindex,nofollow";

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

async function fetchProjects(config){
  const select = P.PROJECT_DETAIL_SELECT.replace(/\s+/g, "");
  const pageSize = 500;
  const rows = [];

  for(let from = 0; ; from += pageSize){
    const url = `${config.url}/rest/v1/residential_projects`
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
   a generated page sits one folder deeper. */
function rebaseLinks($){
  $("[href], [src]").each((_, el) => {
    ["href", "src"].forEach(attr => {
      const v = $(el).attr(attr);
      if(v && !SKIP_URL.test(v)) $(el).attr(attr, "../" + v);
    });
  });
}

function setMeta($, selector, attr, value){
  const el = $(selector);
  if(el.length) el.attr(attr, value);
}

function toggle($, selector, show){
  $(selector).toggleClass("hidden", !show);
}

function buildPage(template, row, config){
  const p = P.normalizeProject(row, { supabaseUrl: config.url });
  const pageUrl = `${SITE_ORIGIN}/projects/${p.slug}/`;
  const title = P.pageTitle(p);
  const description = P.pageDescription(p);
  const image = p.images.length ? p.images[0].url : `${SITE_ORIGIN}/assets/og-default.jpg`;

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
  setMeta($, 'meta[name="twitter:title"]', "content", title);
  setMeta($, 'meta[name="twitter:description"]', "content", description);
  setMeta($, 'meta[name="twitter:image"]', "content", image);

  $("head").append(`\n<script type="application/ld+json">${P.structuredData(p, pageUrl, SITE_ORIGIN)}</script>\n`);

  /* The page script renders from this row immediately and only
     refreshes it from Supabase. */
  const boot = `window.__KEYS99_ROOT__="../../";window.__KEYS99_SLUG__=${JSON.stringify(p.slug)};`
    + `window.__KEYS99_PROJECT__=${JSON.stringify(row).replace(/</g, "\\u003c")};`;
  $('script[src="../js/config.js"]').before(`<script>${boot}</script>\n  `);

  /* ---- body: same fields renderProject() fills in the browser ---- */
  $("#loading").addClass("hidden");
  $("#propertyPage").removeClass("hidden");

  $("#propertyName").text(p.name);
  $("#crumbName").text(p.name);
  const citySlug = P.slugify(p.city), localitySlug = P.slugify(p.locality);
  [["#crumbCity", p.city, citySlug], ["#crumbLocality", p.locality, citySlug && localitySlug ? `${citySlug}/${localitySlug}` : ""]].forEach(([sel, text, hubPath]) => {
    $(sel).text(text);
    if(hubPath) $(sel).attr("href", `${hubPath}/`);   // template links are relative to projects/
    toggle($, sel, !!text);
    toggle($, sel + "Sep", !!text);
  });
  $("#miniBreadcrumb").text(p.typeLabel);
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
  $("#bhk").text(p.bhkLabels.length ? p.bhkLabels.join(" / ") : "—");
  $("#carpetArea").text(p.firstArea || "—");
  $("#possession").text(p.possession || (p.status === "Ready to Move" ? "Ready" : "—"));
  $("#description").text(p.overview || "Project description will be available soon.");
  $("#metaLine").text(p.rera ? "RERA: " + p.rera : "");
  if(p.rera) $("#reraBadge").removeAttr("hidden");

  if(p.images.length){
    $("#mainImage").attr("src", p.images[0].url).attr("alt", p.images[0].alt || p.name);
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
    ["#amenitiesSection", "#amenities", P.renderAmenities(p)],
    ["#specsSection", "#specifications", P.renderSpecificationRows(p)],
    ["#towersSection", "#towers", P.renderTowerRows(p)],
    ["#prosConsSection", "#prosCons", P.renderProsCons(p)],
    ["#faqSection", "#faqs", P.renderFaqs(p)]
  ].forEach(([section, container, html]) => {
    $(container).html(html);
    toggle($, section, !!html.trim());
  });

  $("#locationAdvantages").html(P.renderNearbyRows(p));
  toggle($, "#locationSection", p.nearby.length > 0 || !!p.location);

  rebaseLinks($);

  return { slug: p.slug, html: $.html(), lastmod: p.updatedAt };
}


/* ---------------- OUTPUT ---------------- */

function removeStalePages(current){
  let previous = [];
  try{ previous = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }catch(_){}

  /* Entries are project slugs and hub paths ("pune", "pune/moshi").
     Deepest first, so a city folder is only removed once empty. */
  const valid = entry => entry.split("/").every(seg => SLUG_RE.test(seg));
  previous
    .filter(entry => valid(entry) && !current.includes(entry))
    .sort((a, b) => b.split("/").length - a.split("/").length)
    .forEach(entry => {
      const dir = path.join(ROOT, "projects", ...entry.split("/"));
      const file = path.join(dir, "index.html");
      if(fs.existsSync(file)) fs.unlinkSync(file);
      try{ fs.rmdirSync(dir); }catch(_){}   // only removes the folder if nothing else is in it
      console.log("  removed  /projects/" + entry + "/");
    });

  fs.writeFileSync(MANIFEST, JSON.stringify(current.sort(), null, 2) + "\n");
}

function writeSitemap(pages, hubs){
  const day = v => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  };
  const urls = [
    { loc: SITE_ORIGIN + "/", lastmod: "" },
    ...(hubs || []).filter(h => h.count >= HUB_MIN_INDEXED)
      .map(h => ({ loc: `${SITE_ORIGIN}/projects/${h.path}/`, lastmod: day(h.lastmod) })),
    ...pages.map(p => ({ loc: `${SITE_ORIGIN}/projects/${p.slug}/`, lastmod: day(p.lastmod) }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>\n    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}\n  </url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
}


/* ---------------- MAIN ---------------- */

async function main(){
  const config = readConfig();
  const dataArg = process.argv.indexOf("--data");
  const rows = dataArg > -1 ? readDataFile(process.argv[dataArg + 1]) : await fetchProjects(config);
  const template = fs.readFileSync(TEMPLATE, "utf8");

  const pages = [];
  for(const row of rows){
    if(!row || !SLUG_RE.test(String(row.slug || ""))){
      console.warn(`  skipped  project ${row && row.id}: slug "${row && row.slug}" is not a clean URL slug`);
      continue;
    }
    if(row.slug === "property-details" || row.slug === "search"){
      console.warn(`  skipped  project ${row.id}: slug "${row.slug}" is reserved`);
      continue;
    }
    const page = buildPage(template, row, config);
    const dir = path.join(ROOT, "projects", page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page.html);
    pages.push(page);
    console.log("  wrote    /projects/" + page.slug + "/");
  }

  /* City + locality hubs, from the same projects. */
  const indexPath = path.join(ROOT, "index.html");
  const goodRows = rows.filter(r => r && SLUG_RE.test(String(r.slug || "")));
  const H = loadHomepageFunctions(fs.readFileSync(indexPath, "utf8"), config.url);
  const hubs = buildHubs({
    H,
    indexHtml: fs.readFileSync(indexPath, "utf8"),
    props: goodRows.map(row => H.mapResidentialProject(row)),
    reservedSlugs: new Set([...pages.map(p => p.slug), "property-details", "search"]),
    siteOrigin: SITE_ORIGIN,
    robots: count => !INDEXABLE ? "noindex,nofollow"
      : count >= HUB_MIN_INDEXED ? "index,follow,max-image-preview:large" : "noindex,follow"
  });
  hubs.forEach(hub => {
    const dir = path.join(ROOT, "projects", ...hub.path.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), hub.html);
    console.log(`  wrote    /projects/${hub.path}/  (${hub.count} project${hub.count === 1 ? "" : "s"})`);
  });

  const allProps = goodRows.map(row => H.mapResidentialProject(row));
  fs.writeFileSync(path.join(ROOT, "projects", "search.html"), buildSearchPage({
    H, indexHtml: fs.readFileSync(indexPath, "utf8"), props: allProps, siteOrigin: SITE_ORIGIN
  }));
  console.log(`  wrote    /projects/search.html  (${allProps.length} projects)`);

  removeStalePages([...pages.map(p => p.slug), ...hubs.map(h => h.path)]);
  writeSitemap(pages, hubs);

  const home = buildHomepage(indexPath, goodRows, config.url);
  console.log(`  wrote    / (homepage sections: ${home.projects} projects, ${home.stats.cities} cities)`);

  console.log(`\n  ${pages.length} project page(s), ${hubs.length} city/locality page(s), sitemap.xml updated` +
    (INDEXABLE ? "" : "\n  pages are noindex (set SITE_INDEXABLE=true at launch)"));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

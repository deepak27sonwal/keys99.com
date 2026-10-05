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
const { buildBlog } = require("./blog.js");
const { buildComparePage } = require("./compare.js");
const { buildComparisons } = require("./compare-pages.js");
const { buildSavedPage, buildReelsPage } = require("./extra-pages.js");
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
/* Where the files are actually served. Link-preview images (og:image)
   must load from a working address, or WhatsApp shows no picture.
   While testing on GitHub Pages the workflow sets this to the Pages
   address; at launch on keys99.com it is unset and equals SITE_ORIGIN.
   Canonical URLs, the sitemap and structured data always use SITE_ORIGIN. */
const ASSET_ORIGIN = (process.env.ASSET_ORIGIN || SITE_ORIGIN).replace(/\/+$/, "");
const DEFAULT_SHARE_IMAGE = `${ASSET_ORIGIN}/assets/og-default.jpg`;
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
      if(v && !SKIP_URL.test(v)) $(el).attr(attr, joinPath("../", v));
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

function buildPage(template, row, config, allProjects, shareImage, similarCards, hubLinks, compareLinks){
  const p = P.normalizeProject(row, { supabaseUrl: config.url, root: "../" });   // template-relative; rebaseLinks() adds the extra ../
  const pageUrl = `${SITE_ORIGIN}/projects/${p.slug}/`;
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
    + `window.__KEYS99_PROJECT__=${JSON.stringify(row).replace(/</g, "\\u003c")};`;
  /* Prefix match: the link may carry a ?v= version (asset-versions.js). */
  const configScript = $('script[src^="../js/config.js"]');
  if(!configScript.length) throw new Error("projects/property-details.html no longer loads ../js/config.js");
  configScript.first().before(`<script>${boot}</script>\n  `);

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
  $("#priceUpdated").text(p.pricesUpdatedText ? "Prices updated " + p.pricesUpdatedText : "");
  toggle($, "#priceUpdated", !!p.pricesUpdatedText);
  $("#bhk").text(p.bhkLabels.length ? p.bhkLabels.join(" / ") : "—");
  $("#carpetArea").text(p.firstArea || "—");
  $("#possession").text(p.possession || (p.status === "Ready to Move" ? "Ready" : "—"));
  $("#description").text(p.overview || "Project description will be available soon.");
  $("#metaLine").text(p.rera ? "RERA: " + p.rera : "");
  if(p.rera) $("#reraBadge").removeAttr("hidden");

  if(p.images.length){
    $("#mainImage").attr("src", p.images[0].large).attr("data-full", p.images[0].url).attr("alt", p.images[0].alt || p.name);
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
    ["#faqSection", "#faqs", P.renderFaqs(p)],
    ["#blogSection", "#projectBlogs", P.renderBlogs(p)]
  ].forEach(([section, container, html]) => {
    $(container).html(html);
    toggle($, section, !!html.trim());
  });

  /* Compare button on the main photo (js/compare-tray.js). */
  $("#compareBtn").attr("data-compare-slug", p.slug).attr("data-compare-name", p.name).removeClass("hidden");

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
            <a class="explore-link" href="${P.escapeHtml(h.path)}/">${P.escapeHtml(h.label)}<span>${h.count} project${h.count === 1 ? "" : "s"}</span></a>`).join(""));
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

  rebaseLinks($);

  /* Photos, master plans and floor plans, for the image sitemap
     (Google Images: "<project> photos", "<project> floor plan"). */
  const images = [...p.images, ...p.masterPlans, ...p.floorPlans]
    .map(i => i.url).filter(u => /^https?:\/\//i.test(u))
    .filter((u, i, a) => a.indexOf(u) === i).slice(0, 30);

  return { slug: p.slug, html: $.html(), lastmod: p.updatedAt, images };
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
    ...(extra || []).map(loc => ({ loc: SITE_ORIGIN + loc, lastmod: "" })),
    ...(hubs || []).filter(h => h.indexable || h.count >= HUB_MIN_INDEXED)
      .map(h => ({ loc: `${SITE_ORIGIN}/${h.dir}/`, lastmod: day(h.lastmod) })),
    ...pages.map(p => ({ loc: `${SITE_ORIGIN}/projects/${p.slug}/`, lastmod: day(p.lastmod), images: p.images || [] })),
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

async function main(){
  const config = readConfig();
  const dataArg = process.argv.indexOf("--data");
  const rows = dataArg > -1 ? readDataFile(process.argv[dataArg + 1]) : await fetchProjects(config);
  const template = fs.readFileSync(TEMPLATE, "utf8");

  /* Every project that gets a page, for the "Similar Projects" links. */
  const allProjects = rows
    .filter(r => r && SLUG_RE.test(String(r.slug || "")) && r.slug !== "property-details" && r.slug !== "search")
    .map(r => P.normalizeProject(r, { supabaseUrl: config.url, root: "../" }));

  const indexPath = path.join(ROOT, "index.html");
  const goodRows = rows.filter(r => r && SLUG_RE.test(String(r.slug || "")));
  const H = loadHomepageFunctions(fs.readFileSync(indexPath, "utf8"), config.url);
  const allProps = goodRows.map(row => H.mapResidentialProject(row));

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
    props: goodRows.map(row => H.mapResidentialProject(row)),
    rows: goodRows,
    reservedSlugs: new Set([...builtSlugs, "property-details", "search"]),
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
  hubs.filter(h => h.base === "projects" && h.path.includes("/") && (h.indexable || h.count >= HUB_MIN_INDEXED))
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
    const dir = path.join(ROOT, "projects", page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page.html);
    pages.push(page);
    console.log("  wrote    /projects/" + page.slug + "/");
  }

  fs.writeFileSync(path.join(ROOT, "projects", "search.html"), buildSearchPage({
    H, indexHtml: fs.readFileSync(indexPath, "utf8"), props: allProps, siteOrigin: SITE_ORIGIN
  }));
  console.log(`  wrote    /projects/search.html  (${allProps.length} projects)`);

  fs.writeFileSync(path.join(ROOT, "projects", "compare.html"), buildComparePage({
    indexHtml: fs.readFileSync(indexPath, "utf8"), siteOrigin: SITE_ORIGIN
  }));
  console.log("  wrote    /projects/compare.html");

  fs.writeFileSync(path.join(ROOT, "saved.html"), buildSavedPage({
    H, indexHtml: fs.readFileSync(indexPath, "utf8"), props: allProps, siteOrigin: SITE_ORIGIN
  }));
  console.log("  wrote    /saved.html");

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
    ...pages.map(p => p.slug),
    ...hubs.filter(h => h.base === "projects").map(h => h.path),
    ...blog.projectPages.map(p => p.path)
  ]);
  removeStalePages("developers", hubs.filter(h => h.base === "developers").map(h => h.path));
  removeStalePages("blog", blog.pages.map(p => p.slug));
  removeStalePages("compare", comparisons.pages.map(p => p.slug));
  writeSitemap(pages, hubs, [...blog.pages, ...blog.projectPages, ...comparisons.pages].filter(p => !p.draft), reels.count ? ["/reels"] : []);

  const home = buildHomepage(indexPath, goodRows, config.url);
  /* Homepage link preview: the brand image, from where the site is served. */
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, "utf8")
    .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(")/g, `$1${DEFAULT_SHARE_IMAGE}$2`));
  console.log(`  wrote    / (homepage sections: ${home.projects} projects, ${home.stats.cities} cities)`);

  /* Last: version every CSS/JS link so browsers never pair new pages
     with old cached styles or scripts. */
  const stamped = stampAssetVersions(ROOT, [
    indexPath,
    path.join(ROOT, "about.html"),
    path.join(ROOT, "contact.html"),
    path.join(ROOT, "home-loans.html"),
    path.join(ROOT, "privacy-policy.html"),
    path.join(ROOT, "terms.html"),
    path.join(ROOT, "saved.html"),
    path.join(ROOT, "reels.html"),
    ...htmlFiles(ROOT, ["projects", "developers", "blog", "compare", "admin"])
  ]);
  console.log(`  versioned CSS/JS links in ${stamped} page(s)`);

  console.log(`\n  ${pages.length} project page(s), ${blog.projectPages.length} project post(s), ${hubs.length} city/locality page(s), sitemap.xml updated` +
    (INDEXABLE ? "" : "\n  pages are noindex (set SITE_INDEXABLE=true at launch)"));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

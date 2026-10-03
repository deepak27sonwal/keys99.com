/* =========================================================
   KEYS99 - SAVED + REELS PAGES (site root)

   saved.html  The visitor's hearted projects and recently viewed
               ones. Every published project's card is in the page;
               js/saved.js shows the ones this browser saved, so it
               works without accounts or a database request.
   reels.html  Every project video (YouTube, Instagram, Facebook or
               an uploaded file) with its project. A thumbnail shows
               first; js/reels.js swaps in the player on tap, so the
               page stays fast however many videos there are.
========================================================= */

const cheerio = require("cheerio");
const { homepageChrome, rebase } = require("./hubs");

function shell({ chrome, title, description, canonical, robots, css, main, scripts }){
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<link rel="icon" href="favicon.ico">
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/hub.css">
${css.map(href => `<link rel="stylesheet" href="${href}">`).join("\n")}
</head>
<body data-root="">

${chrome.header}

${chrome.mobileMenu}

${main}

${chrome.footer}

${chrome.bottomNav}

${scripts.map(src => `<script defer src="${src}"></script>`).join("\n")}
</body>
</html>
`;
}

/* The bottom-menu tab for this page is shown as the active one. */
function finish(html, activeTab){
  const $ = cheerio.load(html);
  $("#bottomNav button").removeClass("bn-active");
  if(activeTab) $(`#bottomNav button[data-target="${activeTab}"]`).addClass("bn-active");
  rebase($, "");
  return $.html();
}

function buildSavedPage({ H, indexHtml, props, siteOrigin }){
  const chrome = homepageChrome(indexHtml);
  const cards = props.map(p => H.createPropertyCard(p)).join("");
  const main = `
<main class="hub saved-page">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span><span aria-current="page">Saved</span>
    </nav>

    <header class="hub-head">
      <div class="section-kicker">Your shortlist</div>
      <h1>Saved Projects</h1>
      <p class="hub-intro">Projects you tap ♡ on are kept here, on this device - no account needed.</p>
    </header>

    <section class="hub-section" aria-labelledby="savedTitle">
      <h2 class="section-title" id="savedTitle">Saved <span class="saved-heading-count" id="savedCount"></span></h2>
      <div class="hub-grid" id="savedList"></div>
      <div class="search-empty" id="savedEmpty" hidden>
        <strong>No saved projects yet.</strong>
        <p>Tap the ♡ on any project to save it here.</p>
        <a class="btn-primary" href="projects/search">Browse projects</a>
      </div>
    </section>

    <section class="hub-section" aria-labelledby="recentTitle" id="recentSection" hidden>
      <h2 class="section-title" id="recentTitle">Recently Viewed</h2>
      <div class="hub-grid" id="recentList"></div>
    </section>

    <!-- Every project's card; js/saved.js moves the saved and recently
         viewed ones into the lists above. -->
    <div id="savedPool" hidden>${cards}</div>
  </div>
</main>`;
  return finish(shell({
    chrome,
    title: "Saved Projects | Keys99",
    description: "Your saved and recently viewed projects on Keys99.",
    canonical: `${siteOrigin}/saved`,
    robots: "noindex,follow",
    css: ["css/media-pages.css"],
    main,
    scripts: ["js/hub.js", "js/attribution.js", "js/compare-tray.js", "js/saved.js"]
  }), "saved");
}

function buildReelsPage({ H, P, indexHtml, rows, supabaseUrl, siteOrigin, robots }){
  const chrome = homepageChrome(indexHtml);
  const e = H.escapeHtml;

  const videos = [];
  rows.forEach(row => {
    const p = P.normalizeProject(row, { supabaseUrl, root: "" });
    p.videos.forEach(v => {
      const info = P.videoInfo(v.url);
      if(info.platform === "other") return;
      videos.push({ p, v, info });
    });
  });

  const typeLabel = { video: "Video", reel: "Reel", virtual_tour: "Virtual tour" };
  const platformLabel = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", file: "Video" };

  const cards = videos.map(({ p, v, info }) => {
    const img = p.images[0];
    const poster = info.thumb || (img ? img.card : "assets/property-placeholder.svg");
    const title = v.title || `${p.name} ${typeLabel[v.type] || "Video"}`;
    const player = info.platform === "file"
      ? `<video controls playsinline preload="none" poster="${e(img ? img.card : "")}"><source src="${e(v.url)}"></video>`
      : `<button type="button" class="reel-play" data-embed="${e(info.embed)}" aria-label="Play ${e(title)}">
          <img src="${e(poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          <span class="reel-play-icon" aria-hidden="true">▶</span>
        </button>`;
    return `
    <article class="reel-card${info.tall ? " is-tall" : ""}">
      <div class="reel-media">${player}</div>
      <div class="reel-body">
        <span class="reel-tag">${e(typeLabel[v.type] || "Video")} · ${e(platformLabel[info.platform])}</span>
        <strong>${e(title)}</strong>
        <a class="reel-project" href="projects/${e(p.slug)}/">${e(p.name)}${p.location ? ` · ${e([p.locality, p.city].filter(Boolean).join(", "))}` : ""} →</a>
      </div>
    </article>`;
  }).join("");

  const main = `
<main class="hub reels-page">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span><span aria-current="page">Reels</span>
    </nav>

    <header class="hub-head">
      <div class="section-kicker">Watch before you visit</div>
      <h1>Project Videos &amp; Reels</h1>
      <p class="hub-intro">${videos.length
        ? `${videos.length} video${videos.length === 1 ? "" : "s"} of new projects - walkthroughs, sample flats and site tours. Tap one to play.`
        : "Project walkthroughs and reels will appear here as they are added."}</p>
    </header>

    ${videos.length ? `<div class="reel-grid">${cards}</div>` : `
    <div class="search-empty">
      <strong>Videos coming soon.</strong>
      <p>Meanwhile, browse projects and their photos.</p>
      <a class="btn-primary" href="projects/search">Browse projects</a>
    </div>`}
  </div>
</main>`;

  return { count: videos.length, html: finish(shell({
    chrome,
    title: "Project Videos &amp; Reels | Keys99",
    description: "Watch walkthroughs and reels of new residential projects on Keys99.",
    canonical: `${siteOrigin}/reels`,
    robots,
    css: ["css/media-pages.css"],
    main,
    scripts: ["js/hub.js", "js/attribution.js", "js/compare-tray.js", "js/reels.js"]
  }), "reels") };
}

module.exports = { buildSavedPage, buildReelsPage };

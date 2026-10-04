/* =========================================================
   KEYS99 - COMPARE PAGE  (projects/compare.html)

   The page shell only: js/compare.js reads ?p=slug1,slug2,slug3,
   loads those projects live from Supabase and draws the table.
   Kept out of search results (noindex) - its content depends on
   what each visitor picked.
========================================================= */

const cheerio = require("cheerio");
const { homepageChrome, rebase } = require("./hubs");

function buildComparePage({ indexHtml, siteOrigin }){
  const chrome = homepageChrome(indexHtml);
  const prefix = "../";                                  // projects/compare.html

  const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>Compare Projects | Keys99</title>
<meta name="description" content="Compare new residential projects side by side: price, price per sq ft, configurations, possession, RERA and amenities.">
<link rel="canonical" href="${siteOrigin}/projects/compare">
<meta name="robots" content="noindex,follow">
<link rel="icon" href="favicon.ico">
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/cards.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/compare.css">
</head>
<body data-root="${prefix}">

${chrome.header}

${chrome.mobileMenu}

<main class="hub compare-page">
  <div class="container">

    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      <a href="projects/search">Projects</a><span>›</span>
      <span aria-current="page">Compare</span>
    </nav>

    <header class="hub-head">
      <div class="section-kicker">Side by side</div>
      <h1>Compare Projects</h1>
      <p class="hub-intro" id="compareIntro">Price, size, possession, RERA and amenities of the projects you picked.</p>
    </header>

    <p class="compare-status" id="compareStatus" aria-live="polite">Loading projects…</p>

    <div class="compare-scroll" id="compareScroll" hidden>
      <table class="compare-table" id="compareTable"></table>
    </div>

    <div class="search-empty" id="compareEmpty" hidden>
      <strong>Pick at least two projects to compare.</strong>
      <p>Tap <b>⇄ Compare</b> on any project card or project page, then come back here.</p>
      <a class="btn-primary" href="projects/search">Browse projects</a>
    </div>

  </div>
</main>

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/supabase.js"></script>
<script defer src="js/config.js"></script>
<script defer src="js/project-core.js"></script>
<script defer src="js/hub.js"></script>
<script defer src="js/attribution.js"></script>
<script defer src="js/compare-tray.js"></script>
<script defer src="js/compare.js"></script>
</body>
</html>
`;

  const $ = cheerio.load(html);
  rebase($, prefix);
  return $.html();
}

module.exports = { buildComparePage };

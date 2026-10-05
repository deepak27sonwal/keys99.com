/* =========================================================
   KEYS99 - SEARCH PAGE (projects/search.html)

   Written at build time with every published project as a card
   (the homepage's own createPropertyCard), then filtered and
   sorted instantly in the browser by js/search.js - no database
   call. Reads the same query string the homepage sends:
     q, type, bhk, city, locality, status, minPrice, maxPrice, sort

   Search result pages are never indexed (noindex,follow): the
   city and locality pages are the indexable listings.
========================================================= */

const cheerio = require("cheerio");
const { homepageChrome, rebase } = require("./hubs.js");

const PRICE_STEPS = [
  [2500000, "₹ 25 Lakh"], [5000000, "₹ 50 Lakh"], [7500000, "₹ 75 Lakh"],
  [10000000, "₹ 1 Cr"], [15000000, "₹ 1.5 Cr"], [20000000, "₹ 2 Cr"],
  [50000000, "₹ 5 Cr"], [100000000, "₹ 10 Cr"]
];

const TYPES = [
  ["residential", "Residential"], ["commercial", "Commercial"],
  ["rent", "Rent"], ["resale", "Resale"],
  ["luxury", "Luxury / Villa"], ["plots", "Plots & Land"]
];

function buildSearchPage({ H, indexHtml, props, siteOrigin }){
  const chrome = homepageChrome(indexHtml);
  const e = H.escapeHtml;
  const prefix = "../";                                  // projects/search.html

  /* Filter options come from the data, so nothing offers a choice
     that returns no results. */
  const cities = H.computeTopCities(props, 100)
    .map(c => ({ value: H.slugify(c.city), label: H.titleCaseName(c.city) }));
  const localities = H.computeTopLocalities(props, 500)
    .map(l => ({ value: H.slugify(l.locality), city: H.slugify(l.city), label: H.titleCaseName(l.locality) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const bhks = [...new Set(props.flatMap(p => H.getBhkOptions(p).map(o => H.normaliseBhkType(o.type))).filter(b => /bhk/i.test(b)))]
    .sort((a, b) => parseFloat(a) - parseFloat(b));

  const option = (value, label, extra) => `<option value="${e(value)}"${extra || ""}>${e(label)}</option>`;

  const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>Search New Projects &amp; Flats for Sale | Keys99</title>
<meta name="description" content="Search new residential projects by city, locality, BHK, budget and type on Keys99.">
<link rel="canonical" href="${e(siteOrigin)}/projects/search">
<meta name="robots" content="noindex,follow">
<link rel="icon" href="favicon.ico">
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/cards.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/custom-select.css">
<link rel="stylesheet" href="css/search.css">
</head>
<body data-root="${prefix}">

${chrome.header}

${chrome.mobileMenu}

<main class="hub search-page">
  <div class="container">

    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      <span aria-current="page">Search</span>
    </nav>

    <header class="hub-head">
      <h1 id="searchHeading">Search Projects</h1>
    </header>

    <form class="search-filters" id="searchFilters" autocomplete="off">
      <label class="sf-field sf-query">
        <span>Search</span>
        <input type="search" name="q" id="sfQuery" placeholder="Project, developer, locality…">
      </label>

      <label class="sf-field">
        <span>City</span>
        <select name="city" id="sfCity">
          ${option("", "All Cities")}
          ${cities.map(c => option(c.value, c.label)).join("")}
        </select>
      </label>

      <label class="sf-field">
        <span>Locality</span>
        <select name="locality" id="sfLocality">
          ${option("", "All Localities")}
          ${localities.map(l => option(l.value, l.label, ` data-city="${e(l.city)}"`)).join("")}
        </select>
      </label>

      <label class="sf-field">
        <span>BHK</span>
        <select name="bhk" id="sfBhk">
          ${option("", "Any BHK")}
          ${bhks.map(b => option(b.toLowerCase(), b)).join("")}
          ${option("4+ bhk", "4+ BHK")}
        </select>
      </label>

      <label class="sf-field">
        <span>Type</span>
        <select name="type" id="sfType">
          ${option("", "All Types")}
          ${TYPES.map(([v, l]) => option(v, l)).join("")}
        </select>
      </label>

      <label class="sf-field">
        <span>Min Price</span>
        <select name="minPrice" id="sfMin">
          ${option("", "No Min")}
          ${PRICE_STEPS.map(([v, l]) => option(v, l)).join("")}
        </select>
      </label>

      <label class="sf-field">
        <span>Max Price</span>
        <select name="maxPrice" id="sfMax">
          ${option("", "No Max")}
          ${PRICE_STEPS.map(([v, l]) => option(v, l)).join("")}
        </select>
      </label>

      <label class="sf-field">
        <span>Sort By</span>
        <select name="sort" id="sfSort">
          ${option("newest", "Newest First")}
          ${option("price-asc", "Price: Low to High")}
          ${option("price-desc", "Price: High to Low")}
        </select>
      </label>

      <input type="hidden" name="status" id="sfStatus">

      <div class="sf-actions">
        <button type="reset" class="btn-ghost" id="sfClear">Clear</button>
      </div>
    </form>

    <div class="search-summary">
      <h2 id="searchCount" aria-live="polite">${props.length} projects</h2>
    </div>

    <div class="hub-grid" id="searchResults">
      ${props.map(p => H.createPropertyCard(p)).join("")}
    </div>

    <div class="search-empty" id="searchEmpty" hidden>
      <strong>No projects match these filters.</strong>
      <p id="searchEmptyNote">Try removing a filter or widening the price range.</p>
      <button type="button" class="btn-primary" id="searchReset">Clear all filters</button>
    </div>

  </div>
</main>

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/custom-select.js"></script>
<script defer src="js/cards.js"></script>
<script defer src="js/hub.js"></script>
<script defer src="js/nav-fx.js"></script>
<script defer src="js/attribution.js"></script>
<script defer src="js/compare-tray.js"></script>
<script defer src="js/search.js"></script>
</body>
</html>
`;

  const $ = cheerio.load(html);
  /* The Search tab is the current page, so it shows as active (with
     the bottom navigation's highlight bubble). */
  $("#bottomNav button").removeClass("bn-active");
  $('#bottomNav button[data-target="search"]').addClass("bn-active");
  rebase($, prefix);
  return $.html();
}

module.exports = { buildSearchPage };

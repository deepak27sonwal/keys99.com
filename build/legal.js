/* =========================================================
   KEYS99 - TEXT PAGES (/about.html, /contact.html,
   /privacy-policy.html, /terms.html)

   The text lives in content/*.html. This wraps it in the same
   header, mobile menu, footer and bottom navigation as the
   homepage (copied from index.html at build time), so the pages
   never drift from the rest of the site.
========================================================= */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { homepageChrome } = require("./hubs.js");

const PAGES = [
  {
    file: "about.html",
    type: "AboutPage",
    title: "About Keys99 | New Residential Projects in Pune",
    h1: "About Keys99",
    kicker: "About",
    description: "Keys99 helps home buyers find new residential projects in Pune, with prices, floor plans, amenities and RERA details for every project."
  },
  {
    file: "contact.html",
    type: "ContactPage",
    title: "Contact Keys99",
    h1: "Contact Us",
    kicker: "Contact",
    description: "Get in touch with Keys99 about a new residential project in Pune, a site visit, or listing your project."
  },
  {
    file: "testimonials.html",
    title: "Testimonials | What Home Buyers Say About Keys99",
    h1: "Testimonials",
    kicker: "Testimonials",
    description: "What home buyers who found their new residential project in Pune through Keys99 say about the experience."
  },
  {
    file: "home-loans.html",
    title: "Home Loans from SBI, HDFC, ICICI & More | EMI Calculator | Keys99",
    h1: "Home Loans",
    kicker: "Easy Financing",
    description: "Home loan partners for new projects on Keys99: SBI, HDFC, ICICI, Axis, Kotak and more. Calculate your EMI and see the documents banks ask for."
  },
  {
    file: "privacy-policy.html",
    title: "Privacy Policy | Keys99",
    h1: "Privacy Policy",
    description: "How Keys99 collects, uses, shares and protects your personal data, and the rights you have under the Digital Personal Data Protection Act, 2023."
  },
  {
    file: "terms.html",
    title: "Terms & Conditions | Keys99",
    h1: "Terms & Conditions",
    description: "The terms that apply when you use Keys99 to find new residential projects and send enquiries."
  }
];

/* Shown in the footer of every page. */
const SUPPORT_EMAIL = "support@keys99.com";

const esc = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildLegalPages({ root, indexHtml, siteOrigin, robots }){
  const chrome = homepageChrome(indexHtml);

  return PAGES.map(page => {
    const body = fs.readFileSync(path.join(root, "content", page.file), "utf8");
    /* Served without ".html" (Cloudflare Pages redirects /x.html to
       /x), so the canonical URL and the nav links use that form. */
    const slug = page.file.replace(/\.html$/, "");
    const url = `${siteOrigin}/${slug}`;

    /* Structured data: what the page is, where it sits, who runs the
       site (the homepage defines #organisation), plus the contact
       email on Contact and the questions on pages that have them. */
    const $body = cheerio.load(body, null, false);
    const faqs = $body("details").map((_, d) => ({
      q: $body(d).find("summary").text().replace(/\s+/g, " ").trim(),
      a: $body(d).find("summary").remove().end().text().replace(/\s+/g, " ").trim()
    })).get().filter(f => f.q && f.a);
    const organisation = { "@id": `${siteOrigin}/#organisation` };
    const graph = [
      {
        "@type": page.type || "WebPage",
        "@id": url + "#webpage",
        url,
        name: page.title,
        description: page.description,
        inLanguage: "en-IN",
        isPartOf: { "@id": `${siteOrigin}/#website` },
        publisher: organisation,
        ...(page.type === "AboutPage" ? { about: organisation } : {}),
        ...(page.type === "ContactPage" ? {
          mainEntity: {
            ...organisation,
            "@type": "RealEstateAgent",
            name: "Keys99",
            url: siteOrigin,
            email: SUPPORT_EMAIL,
            contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, areaServed: "IN" }
          }
        } : {})
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin + "/" },
          { "@type": "ListItem", position: 2, name: page.h1, item: url }
        ]
      }
    ];
    if(faqs.length){
      graph.push({
        "@type": "FAQPage",
        mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))
      });
    }
    const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");

    const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Keys99">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<link rel="icon" href="favicon.ico">
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/legal.css">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body data-root="">

${chrome.header}

${chrome.mobileMenu}

<main class="hub legal">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      <span aria-current="page">${esc(page.h1)}</span>
    </nav>
    <article class="legal-body">
      <div class="section-kicker">${esc(page.kicker || "Legal")}</div>
      <h1>${esc(page.h1)}</h1>
      ${body.replace(/<!--[\s\S]*?-->/, "").trim()}
    </article>
  </div>
</main>

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/hub.js"></script>
<script defer src="js/nav-fx.js"></script>
<script defer src="js/attribution.js"></script>
</body>
</html>
`;
    /* Pages sit at the site root, so links need no re-basing; just
       normalise the markup. */
    const $ = cheerio.load(html);
    $(".nav-links a, #mobileMenu a").each((_, a) => {
      if($(a).attr("href") === slug) $(a).addClass("active");
    });
    return { file: page.file, html: $.html() };
  });
}

module.exports = { buildLegalPages };

/* =========================================================
   KEYS99 - BLOG (/blog/ and /blog/<slug>/)

   Articles live in content/blog/<slug>.html. The file starts with a
   comment holding its details, one per line:

     <!--
     title: Carpet Area vs Built-up Area
     description: One or two sentences for Google and the blog list.
     date: 2026-10-03
     updated: 2026-11-01        (optional)
     author: Keys99 Team        (optional)
     category: Buying Guide     (optional)
     status: draft              (delete once the article is checked)
     -->

   followed by the article in <p>, <h2>, <h3>, <ul>, <ol> and <table>.
   Links are written from the site root ("projects/pune/"), as in the
   locality guides. <details><summary>Q</summary><p>A</p></details>
   blocks become FAQs (and FAQPage JSON-LD).

   A draft is published but kept out of the index and the sitemap, so
   the team can read it on the site before it goes live to Google.
========================================================= */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { homepageChrome, rebase } = require("./hubs");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORDS_PER_MINUTE = 200;

const esc = v => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function isoDay(v){
  const d = new Date(v);
  return v && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function displayDate(day){
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function loadPosts(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".html")).map(file => {
    const slug = file.replace(/\.html$/, "");
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    if(!SLUG_RE.test(slug)){
      console.warn(`  skipped  content/blog/${file}: the file name is not a clean URL slug`);
      return null;
    }
    const head = raw.match(/^\s*<!--([\s\S]*?)-->/);
    const meta = {};
    (head ? head[1] : "").split("\n").forEach(line => {
      const m = line.match(/^\s*([a-z]+):\s*(.*?)\s*$/i);
      if(m) meta[m[1].toLowerCase()] = m[2];
    });
    const date = isoDay(meta.date);
    if(!meta.title || !meta.description || !date){
      console.warn(`  skipped  content/blog/${file}: needs a title, description and date in its top comment`);
      return null;
    }

    const $ = cheerio.load(head ? raw.slice(head[0].length) : raw, null, false);
    const text = el => $(el).text().replace(/\s+/g, " ").trim();
    const faqs = $("details").map((_, d) => {
      const q = text($(d).find("summary"));
      $(d).find("summary").remove();
      return { q, a: text(d) };
    }).get().filter(f => f.q && f.a);
    /* FAQs are drawn by the page template, after the article. */
    $("details").remove();
    $.root().contents().filter((_, n) => n.type === "comment").remove();
    const words = $.root().text().split(/\s+/).filter(Boolean).length
      + faqs.reduce((n, f) => n + (f.q + " " + f.a).split(/\s+/).length, 0);

    return {
      slug,
      title: meta.title,
      description: meta.description,
      date,
      updated: isoDay(meta.updated) || date,
      author: meta.author || "Keys99 Team",
      category: meta.category || "Buying Guide",
      draft: /^draft$/i.test(meta.status || ""),
      html: $.html().trim(),
      faqs,
      minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE))
    };
  }).filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

function shell({ chrome, title, description, canonical, robots, ogType, shareImage, jsonLd, main, prefix }){
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#006b5b">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Keys99">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(shareImage)}">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/legal.css">
<link rel="stylesheet" href="css/blog.css">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body data-root="${prefix}">

${chrome.header}

${chrome.mobileMenu}

${main}

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/hub.js"></script>
<script defer src="js/attribution.js"></script>
</body>
</html>
`;
}

function finish(html, prefix){
  const $ = cheerio.load(html);
  $(".nav-links a.active").removeClass("active");
  rebase($, prefix);
  return $.html();
}

function postCard(p){
  return `
      <article class="blog-card">
        <div class="blog-card-meta">${esc(p.category)} · ${p.minutes} min read</div>
        <h2><a href="blog/${p.slug}/">${esc(p.title)}</a></h2>
        <p>${esc(p.description)}</p>
        <time datetime="${p.date}">${displayDate(p.date)}</time>
      </article>`;
}

function buildBlog({ root, indexHtml, siteOrigin, robots, indexable, defaultShareImage }){
  const posts = loadPosts(path.join(root, "content", "blog"));
  if(!posts.length) return { pages: [], posts };
  const chrome = homepageChrome(indexHtml);
  const organisation = {
    "@type": "RealEstateAgent",
    "@id": `${siteOrigin}/#organisation`,
    name: "Keys99",
    url: siteOrigin,
    logo: { "@type": "ImageObject", url: `${siteOrigin}/assets/logo.png` }
  };
  /* Before launch every page uses the site-wide robots value; after
     it, drafts stay out of the index. */
  const robotsFor = draft => indexable && draft ? "noindex,follow" : robots;
  const blogUrl = `${siteOrigin}/blog/`;
  const pages = [];

  posts.forEach(p => {
    const url = `${blogUrl}${p.slug}/`;
    const prefix = "../../";
    const others = posts.filter(o => o !== p).slice(0, 3);
    const graph = [
      {
        "@type": "BlogPosting",
        "@id": url + "#article",
        headline: p.title,
        description: p.description,
        url,
        mainEntityOfPage: url,
        datePublished: p.date,
        dateModified: p.updated,
        inLanguage: "en-IN",
        articleSection: p.category,
        image: defaultShareImage,
        author: { "@type": "Organization", name: p.author, url: siteOrigin },
        publisher: organisation,
        isPartOf: { "@id": blogUrl + "#blog" }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin + "/" },
          { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
          { "@type": "ListItem", position: 3, name: p.title, item: url }
        ]
      }
    ];
    if(p.faqs.length){
      graph.push({
        "@type": "FAQPage",
        mainEntity: p.faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))
      });
    }

    const main = `
<main class="hub legal blog">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      <a href="blog/">Blog</a><span>›</span>
      <span aria-current="page">${esc(p.title)}</span>
    </nav>
    <article class="legal-body blog-body">
      <div class="section-kicker">${esc(p.category)}</div>
      <h1>${esc(p.title)}</h1>
      <p class="blog-meta">By ${esc(p.author)} · ${p.updated !== p.date ? `Updated <time datetime="${p.updated}">${displayDate(p.updated)}</time>` : `<time datetime="${p.date}">${displayDate(p.date)}</time>`} · ${p.minutes} min read</p>
      ${p.html}
      ${p.faqs.length ? `
      <h2 id="faq">Frequently Asked Questions</h2>
      <div class="hub-faqs">${p.faqs.map(f => `
        <details class="hub-faq">
          <summary>${esc(f.q)}</summary>
          <p>${esc(f.a)}</p>
        </details>`).join("")}
      </div>` : ""}
      <aside class="blog-cta">
        <strong>Looking for a new home?</strong>
        <span>Compare new projects with prices, floor plans and RERA details.</span>
        <a class="btn-primary" href="projects/search">Explore projects →</a>
      </aside>
    </article>
    ${others.length ? `
    <section class="hub-section" aria-labelledby="moreArticles">
      <h2 class="section-title" id="moreArticles">More from the Keys99 Blog</h2>
      <div class="blog-grid">${others.map(postCard).join("")}
      </div>
    </section>` : ""}
  </div>
</main>`;

    pages.push({
      dir: `blog/${p.slug}`,
      slug: p.slug,
      draft: p.draft,
      lastmod: p.updated,
      html: finish(shell({
        chrome,
        title: `${p.title} | Keys99`,
        description: p.description,
        canonical: url,
        robots: robotsFor(p.draft),
        ogType: "article",
        shareImage: defaultShareImage,
        jsonLd: { "@context": "https://schema.org", "@graph": graph },
        main,
        prefix
      }), prefix)
    });
  });

  const live = posts.filter(p => !p.draft);
  const listDescription = "Guides for home buyers in Pune and Hyderabad: RERA checks, carpet area, home loans and choosing a new project.";
  const indexMain = `
<main class="hub blog">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      <span aria-current="page">Blog</span>
    </nav>
    <header class="hub-head">
      <div class="section-kicker">Keys99 Blog</div>
      <h1>Home Buying Guides &amp; Tips</h1>
      <p class="hub-intro">${esc(listDescription)}</p>
    </header>
    <section class="hub-section" aria-label="Articles">
      <div class="blog-grid">${posts.map(postCard).join("")}
      </div>
    </section>
  </div>
</main>`;
  pages.push({
    dir: "blog",
    slug: "",
    /* The list is worth indexing once at least one article is. */
    draft: !live.length,
    lastmod: (live[0] || posts[0]).updated,
    html: finish(shell({
      chrome,
      title: "Home Buying Guides & Tips | Keys99 Blog",
      description: listDescription,
      canonical: blogUrl,
      robots: robotsFor(!live.length),
      ogType: "website",
      shareImage: defaultShareImage,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Blog",
            "@id": blogUrl + "#blog",
            name: "Keys99 Blog",
            url: blogUrl,
            description: listDescription,
            inLanguage: "en-IN",
            publisher: organisation,
            blogPost: posts.map(p => ({ "@id": `${blogUrl}${p.slug}/#article` }))
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin + "/" },
              { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl }
            ]
          }
        ]
      },
      main: indexMain,
      prefix: "../"
    }), "../")
  });

  return { pages, posts };
}

module.exports = { buildBlog, loadPosts };

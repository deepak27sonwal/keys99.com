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

   PROJECT POSTS (/projects/<project>/blog/<post>/)

   Posts written for a project in the admin (residential_project_blogs)
   get a page of their own under the project, linked from the
   project page's blog cards and listed on /blog/. The body is plain
   text with a few marks:

     blank line        new paragraph
     ## Heading        section heading (### for a smaller one)
     - item            bulleted list (1. item for a numbered one)
     **bold**          bold text
     [text](link)      a link: https://... or a site path like /projects/pune/

   A post shorter than MIN_INDEXED_WORDS is built and linked, but kept
   out of the index and the sitemap: Google treats short pages as thin
   content, which counts against the whole site.
========================================================= */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { homepageChrome, rebase } = require("./hubs");
const P = require("../js/project-core.js");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORDS_PER_MINUTE = 200;
const MIN_INDEXED_WORDS = P.MIN_INDEXED_WORDS;
/* Google shows about 60 characters of a title. */
const TITLE_MAX = 65;
/* "On this page" links once a post has this many sections. */
const TOC_MIN_HEADINGS = 3;

const esc = v => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function isoDay(v){
  const d = new Date(v);
  return v && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function displayDate(day){
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/* ---------- Project post bodies: plain text to HTML ---------- */

function inlineMarks(text){
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, url) => {
      const raw = url.replace(/&amp;/g, "&");
      if(/^https?:\/\/(?:www\.)?keys99\.com(?:\/|$)/i.test(raw) || /^\/(?!\/)/.test(raw)){
        return `<a href="${url}">${label}</a>`;
      }
      if(/^https?:\/\//i.test(raw)) return `<a href="${url}" rel="noopener" target="_blank">${label}</a>`;
      return label;
    });
}

/* Returns { html, toc }: every h2 gets an id so search results and
   the "On this page" list can link straight to a section. */
function formatArticle(body){
  const out = [], toc = [], ids = new Set();
  let para = [], list = null;
  const flushPara = () => { if(para.length){ out.push(`<p>${para.map(inlineMarks).join("<br>")}</p>`); para = []; } };
  const flushList = () => { if(list){ out.push(`<${list.tag}>${list.items.map(i => `<li>${inlineMarks(i)}</li>`).join("")}</${list.tag}>`); list = null; } };
  String(body || "").replace(/\r\n?/g, "\n").split("\n").forEach(raw => {
    const line = raw.trim();
    let m;
    if(!line){ flushPara(); flushList(); return; }
    /* The page title is the only h1. */
    if((m = line.match(/^(#{1,3})\s+(.+)$/))){
      flushPara(); flushList();
      const level = m[1].length === 3 ? 3 : 2;
      if(level === 3){ out.push(`<h3>${inlineMarks(m[2])}</h3>`); return; }
      const text = m[2].replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
      let id = P.slugify(text) || "section";
      for(let n = 2; ids.has(id); n++) id = id.replace(/-\d+$/, "") + "-" + n;
      ids.add(id);
      toc.push({ id, text });
      out.push(`<h2 id="${id}">${inlineMarks(m[2])}</h2>`);
      return;
    }
    const item = line.match(/^[-*•]\s+(.+)$/) ? ["ul", line.replace(/^[-*•]\s+/, "")]
      : line.match(/^\d+[.)]\s+(.+)$/) ? ["ol", line.replace(/^\d+[.)]\s+/, "")] : null;
    if(item){
      flushPara();
      if(list && list.tag !== item[0]) flushList();
      if(!list) list = { tag: item[0], items: [] };
      list.items.push(item[1]);
      return;
    }
    flushList();
    para.push(line);
  });
  flushPara(); flushList();
  return { html: out.join("\n        "), toc };
}

/* The longest of these that fits; a long post title is kept whole.
   The project name is left out when the post title already has it. */
function postTitle(title, p){
  const named = title.toLowerCase().includes(p.name.toLowerCase());
  const where = p.city ? `${p.name}, ${p.city}` : p.name;
  const options = named
    ? [`${title} | ${p.city} | Keys99`, `${title} | Keys99`]
    : [`${title} | ${where} | Keys99`, `${title} | ${p.name} | Keys99`, `${title} | ${where}`, `${title} | ${p.name}`, `${title} | Keys99`];
  return options.find(t => t.length <= TITLE_MAX && !t.includes("|  |")) || title;
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

function shell({ chrome, title, description, canonical, robots, ogType, shareImage, jsonLd, main, prefix, extraHead }){
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
<meta name="twitter:card" content="summary_large_image">${extraHead ? "\n" + extraHead : ""}
<link rel="icon" href="favicon.ico">
${chrome.fonts}
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/legal.css">
<link rel="stylesheet" href="css/blog.css">
<link rel="alternate" type="application/rss+xml" title="Keys99 Blog" href="blog/feed.xml">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body data-root="${prefix}">

${chrome.header}

${chrome.mobileMenu}

${main}

${chrome.footer}

${chrome.bottomNav}

<script defer src="js/hub.js"></script>
<script defer src="js/nav-fx.js"></script>
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

const CARD_FALLBACK = "if(this.dataset.full){this.src=this.dataset.full;this.dataset.full=''}else{this.parentNode.remove()}";

/* A card on /blog/ and under articles. Guides link to blog/<slug>/,
   project posts to their page under the project. */
function postCard(p){
  return `
      <article class="blog-card${p.image ? " has-cover" : ""}">
        ${p.image ? `<a class="blog-card-cover" href="${p.href}" tabindex="-1" aria-hidden="true"><img src="${esc(p.cardImage || p.image)}" data-full="${esc(p.image)}" alt="" width="640" height="360" loading="lazy" decoding="async" onerror="${CARD_FALLBACK}"></a>` : ""}
        <div class="blog-card-meta">${esc(p.kicker || p.category)} · ${p.minutes} min read</div>
        <h2><a href="${p.href}">${esc(p.title)}</a></h2>
        <p>${esc(p.description)}</p>
        <time datetime="${p.date}">${displayDate(p.date)}</time>
      </article>`;
}

/* ---------- Project posts ---------- */

function projectPostList(projects){
  const posts = [];
  projects.forEach(project => (project.blogs || []).forEach(b => {
    const date = isoDay(b.date);
    if(!date) return;
    posts.push({
      project,
      post: b,
      slug: b.slug,
      dir: b.path.replace(/\/$/, ""),
      href: b.path,
      title: b.title,
      kicker: project.name,
      description: P.shorten(b.description, 200),
      date,
      updated: isoDay(b.updated) || date,
      image: b.image,
      cardImage: b.cover ? b.cover.card : "",
      minutes: Math.max(1, Math.round(b.words / WORDS_PER_MINUTE)),
      thin: !b.indexable
    });
  }));
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

function projectAside(p){
  const img = p.images[0];
  const facts = [
    p.bhkLabels.length ? `<div><small>Configuration</small><strong>${esc(p.bhkLabels.join(", "))}</strong></div>` : "",
    p.firstArea ? `<div><small>Carpet Area</small><strong>${esc(p.firstArea)}</strong></div>` : "",
    p.possession ? `<div><small>Possession</small><strong>${esc(p.possession)}</strong></div>` : "",
    p.rera ? `<div><small>RERA</small><strong>${esc(p.rera)}</strong></div>` : ""
  ].join("");
  return `
      <aside class="post-project" aria-label="About ${esc(p.name)}">
        ${img ? `<a class="post-project-photo" href="${p.basePath || "projects"}/${p.slug}/"><img src="${esc(img.large)}" onerror="this.onerror=null;this.src='${esc(img.url)}'" alt="${esc(img.alt || p.name)}" loading="lazy" decoding="async"></a>` : ""}
        <div class="post-project-body">
          ${p.status ? `<span class="post-project-status">${esc(p.status)}</span>` : ""}
          <h2><a href="${p.basePath || "projects"}/${p.slug}/">${esc(p.name)}</a></h2>
          ${p.location ? `<p class="post-project-where">${esc(p.location)}</p>` : ""}
          ${p.developer ? `<p class="post-project-dev">by ${esc(p.developer)}</p>` : ""}
          <p class="post-project-price">${esc(p.startingPriceText)}${p.startingPrice ? " <small>onwards</small>" : ""}</p>
          ${facts ? `<div class="post-project-facts">${facts}</div>` : ""}
          <a class="btn-primary" href="${p.basePath || "projects"}/${p.slug}/">View project details →</a>
          <a class="post-project-enquire" href="${p.basePath || "projects"}/${p.slug}/#enquiryWrap">Enquire about price &amp; site visit</a>
        </div>
      </aside>`;
}

function similarLinks(list){
  return list.map(o => `
        <a class="post-similar" href="${o.basePath || "projects"}/${o.slug}/">
          <strong>${esc(o.name)}</strong>
          <span>${esc([o.locality, o.city].filter(Boolean).join(", "))}</span>
          <span class="post-similar-price">${esc(o.startingPriceText)}${o.bhkLabels.length ? " · " + esc(o.bhkLabels.join(", ")) : ""}</span>
        </a>`).join("");
}

function buildProjectPostPage(entry, ctx){
  const { project: p, post: b } = entry;
  const { chrome, siteOrigin, robotsFor, organisation, guides, allPosts, allProjects, defaultShareImage, shareImage, copyUrl } = ctx;
  const url = `${siteOrigin}/${entry.href}`;
  const projectUrl = `${siteOrigin}/${p.basePath || "projects"}/${p.slug}/`;
  const blogUrl = `${siteOrigin}/blog/`;
  const prefix = "../../../../";
  const citySlug = P.slugify(p.city);
  const article = formatArticle(b.body);
  /* Link preview: the cover's 1200x630 JPEG, else the project photo's. */
  const preview = (b.image && shareImage(b.image)) || (p.images[0] && shareImage(p.images[0].url)) || null;
  const image = preview || b.image || (p.images[0] && p.images[0].url) || defaultShareImage;
  /* The cover as shown on the page, for structured data and the sitemap. */
  const coverShown = b.cover ? (copyUrl(b.cover.large) || b.image) : "";
  const dateLine = entry.updated !== entry.date
    ? `Updated <time datetime="${entry.updated}">${displayDate(entry.updated)}</time>`
    : `<time datetime="${entry.date}">${displayDate(entry.date)}</time>`;

  const sameProject = allPosts.filter(o => o.project === p && o !== entry).slice(0, 4);
  const similar = P.pickSimilar(p, allProjects, 3);
  const moreGuides = guides.slice(0, 3);

  const crumbs = [
    { name: "Home", item: siteOrigin + "/" },
    p.city && citySlug ? { name: p.city, item: `${siteOrigin}/${p.basePath || "projects"}/${citySlug}/` } : null,
    { name: p.name, item: projectUrl },
    { name: b.title, item: url }
  ].filter(Boolean);

  const graph = [
    {
      "@type": "BlogPosting",
      "@id": url + "#article",
      headline: b.title.slice(0, 110),
      description: entry.description,
      url,
      mainEntityOfPage: url,
      datePublished: entry.date,
      dateModified: entry.updated,
      inLanguage: "en-IN",
      articleSection: p.name,
      keywords: b.tags.length ? b.tags.join(", ") : undefined,
      wordCount: b.words,
      image: coverShown ? [coverShown, image].filter((v, i, a) => a.indexOf(v) === i) : image,
      author: { "@type": "Organization", name: b.author || "Keys99 Team", url: siteOrigin },
      publisher: organisation,
      about: { "@type": "ApartmentComplex", "@id": projectUrl + "#project", name: p.name, url: projectUrl },
      isPartOf: { "@id": blogUrl + "#blog" }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item }))
    }
  ];

  const main = `
<main class="hub legal blog project-post">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      ${p.city && citySlug ? `<a href="${p.basePath || "projects"}/${citySlug}/">${esc(p.city)}</a><span>›</span>` : ""}
      <a href="${p.basePath || "projects"}/${p.slug}/">${esc(p.name)}</a><span>›</span>
      <span aria-current="page">${esc(b.title)}</span>
    </nav>
    <div class="post-layout">
      <article class="legal-body blog-body">
        <div class="section-kicker"><a href="${p.basePath || "projects"}/${p.slug}/">${esc(p.name)}</a>${p.locality ? " · " + esc(p.locality) : ""}</div>
        <h1>${esc(b.title)}</h1>
        <p class="blog-meta">By ${esc(b.author || "Keys99 Team")} · ${dateLine} · ${entry.minutes} min read</p>
        ${b.cover ? `<figure class="post-cover"><img src="${esc(b.cover.large)}" data-full="${esc(b.image)}" alt="${esc(b.title)}" width="1280" height="720" decoding="async" fetchpriority="high" onerror="${CARD_FALLBACK}"></figure>` : ""}
        ${article.toc.length >= TOC_MIN_HEADINGS ? `
        <nav class="post-toc" aria-labelledby="postToc">
          <strong id="postToc">On this page</strong>
          <ol>${article.toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ol>
        </nav>` : ""}
        ${article.html}
        ${b.tags.length ? `<p class="post-tags">${b.tags.map(t => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
        <aside class="blog-cta">
          <strong>Interested in ${esc(p.name)}?</strong>
          <span>See prices, floor plans, amenities and RERA details${p.locality ? ` for this project in ${esc(p.locality)}` : ""}.</span>
          <a class="btn-primary" href="${p.basePath || "projects"}/${p.slug}/">View ${esc(p.name)} →</a>
        </aside>
      </article>
      ${projectAside(p)}
    </div>
    ${sameProject.length ? `
    <section class="hub-section" aria-labelledby="moreProjectPosts">
      <h2 class="section-title" id="moreProjectPosts">More about ${esc(p.name)}</h2>
      <div class="blog-grid">${sameProject.map(postCard).join("")}
      </div>
    </section>` : ""}
    ${similar.length ? `
    <section class="hub-section" aria-labelledby="similarProjects">
      <h2 class="section-title" id="similarProjects">Similar Projects${p.city && similar.every(o => o.city === p.city) ? " in " + esc(p.city) : ""}</h2>
      <div class="post-similar-list">${similarLinks(similar)}
      </div>
    </section>` : ""}
    ${moreGuides.length ? `
    <section class="hub-section" aria-labelledby="buyingGuides">
      <h2 class="section-title" id="buyingGuides">Home Buying Guides</h2>
      <div class="blog-grid">${moreGuides.map(postCard).join("")}
      </div>
    </section>` : ""}
  </div>
</main>`;

  return {
    dir: entry.dir,
    path: entry.dir.replace(/^projects\//, ""),
    draft: entry.thin,
    lastmod: entry.updated,
    image: coverShown,
    html: finish(shell({
      chrome,
      title: postTitle(b.title, p),
      description: P.shorten(entry.description, 158),
      canonical: url,
      robots: robotsFor(entry.thin),
      ogType: "article",
      shareImage: image,
      jsonLd: { "@context": "https://schema.org", "@graph": graph },
      main,
      prefix,
      extraHead: [
        `<meta property="article:published_time" content="${entry.date}">`,
        `<meta property="article:modified_time" content="${entry.updated}">`,
        ...b.tags.map(t => `<meta property="article:tag" content="${esc(t)}">`),
        preview ? `<meta property="og:image:type" content="image/jpeg">\n<meta property="og:image:width" content="${P.OG_SIZE.width}">\n<meta property="og:image:height" content="${P.OG_SIZE.height}">\n<meta property="og:image:alt" content="${esc(b.title)}">` : ""
      ].filter(Boolean).join("\n")
    }), prefix)
  };
}

/* projects: normalised projects (P.normalizeProject, root "") whose
   published posts get pages under projects/<slug>/blog/. */
/* shareImage(url): absolute URL of a photo's 1200x630 link-preview
   copy, or null. copyUrl(path): absolute URL of a resized copy
   ("assets/thumbs/..."), or "" if it was not made. */
function buildBlog({ root, indexHtml, siteOrigin, robots, indexable, defaultShareImage, projects = [],
  shareImage = () => null, copyUrl = () => "" }){
  const posts = loadPosts(path.join(root, "content", "blog"));
  posts.forEach(p => { p.href = `blog/${p.slug}/`; });
  const projectPosts = projectPostList(projects);
  if(!posts.length && !projectPosts.length) return { pages: [], projectPages: [], posts };
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

  const guides = posts.filter(p => !p.draft);
  const projectPages = projectPosts.map(entry => buildProjectPostPage(entry, {
    chrome, siteOrigin, robotsFor, organisation, defaultShareImage, shareImage, copyUrl,
    guides: guides.length ? guides : posts,
    allPosts: projectPosts,
    allProjects: projects
  }));
  /* Thin project posts stay off the list; their project page still links them. */
  const listed = projectPosts.filter(p => !p.thin);

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
  const hasLive = live.length > 0 || listed.length > 0;
  const newest = [...live, ...listed, ...posts].sort((a, b) => b.updated.localeCompare(a.updated))[0];
  const listDescription = "Guides for home buyers in Pune and Hyderabad: RERA checks, carpet area, home loans, choosing a new project, and in-depth notes on individual projects.";
  const indexMain = `
<main class="hub blog">
  <div class="container">
    <nav class="hub-breadcrumb" aria-label="Breadcrumb">
      <a href="./">Home</a><span>›</span>
      <span aria-current="page">Blog</span>
    </nav>
    <header class="hub-head">
      <div class="section-kicker">Keys99 Blog</div>
      <h1>Home Buying Guides &amp; Project Insights</h1>
      <p class="hub-intro">${esc(listDescription)}</p>
    </header>
    ${posts.length ? `
    <section class="hub-section" aria-labelledby="blogGuides">
      <h2 class="section-title" id="blogGuides">Home Buying Guides</h2>
      <div class="blog-grid">${posts.map(postCard).join("")}
      </div>
    </section>` : ""}
    ${listed.length ? `
    <section class="hub-section" aria-labelledby="blogProjects">
      <h2 class="section-title" id="blogProjects">Project Insights</h2>
      <div class="blog-grid">${listed.map(postCard).join("")}
      </div>
    </section>` : ""}
  </div>
</main>`;
  pages.push({
    dir: "blog",
    slug: "",
    /* The list is worth indexing once at least one article is. */
    draft: !hasLive,
    lastmod: newest.updated,
    html: finish(shell({
      chrome,
      title: "Home Buying Guides & Project Insights | Keys99 Blog",
      description: listDescription,
      canonical: blogUrl,
      robots: robotsFor(!hasLive),
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
            blogPost: [
              ...posts.map(p => ({ "@id": `${blogUrl}${p.slug}/#article` })),
              ...listed.map(p => ({ "@id": `${siteOrigin}/${p.href}#article` }))
            ]
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

  return { pages, projectPages, posts, feed: rssFeed({ siteOrigin, items: [...live, ...listed], description: listDescription }) };
}

/* /blog/feed.xml: the newest 50 indexable articles, for feed readers
   and search engines that discover new pages through feeds. */
function rssFeed({ siteOrigin, items, description }){
  const xml = v => esc(v).replace(/'/g, "&apos;");
  const rfc = day => new Date(day + "T00:00:00Z").toUTCString();
  const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Keys99 Blog</title>
  <link>${siteOrigin}/blog/</link>
  <atom:link href="${siteOrigin}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>${xml(description)}</description>
  <language>en-IN</language>${sorted.length ? `
  <lastBuildDate>${rfc(sorted.map(i => i.updated).sort().pop())}</lastBuildDate>` : ""}
${sorted.map(i => `  <item>
    <title>${xml(i.title)}</title>
    <link>${siteOrigin}/${i.href}</link>
    <guid isPermaLink="true">${siteOrigin}/${i.href}</guid>
    <pubDate>${rfc(i.date)}</pubDate>
    <category>${xml(i.kicker || i.category)}</category>
    <description>${xml(i.description)}</description>
  </item>`).join("\n")}
</channel>
</rss>
`;
}

module.exports = { buildBlog, loadPosts, formatArticle, MIN_INDEXED_WORDS };

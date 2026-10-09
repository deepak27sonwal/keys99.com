/* =========================================================
   KEYS99 - PROJECT POST FALLBACK (projects/blog-post.html,
   commercial/blog-post.html)

   A project article published since the last build has no page
   of its own yet. 404.html and .htaccess send
   /projects/<project>/blog/<post>/ here as ?project=&post=, and
   this page loads the article by slug and draws it the way
   build/blog.js does (same formatter: Keys99Project.formatArticle).
   The page is never indexed; the next build writes the real one.
========================================================= */

(function(){
  const P = window.Keys99Project;
  const params = new URLSearchParams(location.search);
  const KIND = P.kindOf(window.__KEYS99_KIND__);
  const ROOT = "../";
  const esc = P.escapeHtml;
  const $ = id => document.getElementById(id);
  const article = $("bpArticle");
  const projectSlug = (params.get("project") || "").trim();
  const postSlug = (params.get("post") || "").trim();

  const fail = (text, link) => {
    article.innerHTML = `<h1>Article not found</h1><p>${esc(text)}</p>` +
      (link ? `<p><a class="btn-primary" href="${esc(link)}">View the project →</a></p>` : "");
  };

  const day = v => {
    const d = new Date(v);
    return v && Number.isFinite(d.getTime())
      ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
  };

  function draw(p, b){
    const base = KIND.base;
    const projectHref = `${ROOT}${base}/${p.slug}/`;
    const body = P.renderPostBody(b);
    const title = `${b.metaTitle || b.title} | ${p.name} | Keys99`;
    document.title = title;
    const mins = b.readMinutes || Math.max(1, Math.round(b.words / 200));
    const date = day(b.date);

    $("bpCrumbs").innerHTML = `<a href="${ROOT}">Home</a><span>›</span>` +
      (p.city ? `<a href="${ROOT}${base}/${esc(P.slugify(p.city))}/">${esc(p.city)}</a><span>›</span>` : "") +
      `<a href="${projectHref}">${esc(p.name)}</a><span>›</span><span aria-current="page">${esc(b.title)}</span>`;

    article.innerHTML = `
      <div class="section-kicker"><a href="${projectHref}">${esc(p.name)}</a>${p.locality ? " · " + esc(p.locality) : ""}</div>
      <h1>${esc(b.title)}</h1>
      <p class="blog-meta">By ${esc(b.author || "Keys99 Team")}${date ? " · " + esc(date) : ""} · ${mins} min read</p>
      ${b.cover ? `<figure class="post-cover"><img src="${esc(b.cover.large)}" data-full="${esc(b.image)}" alt="${esc(b.coverAlt || b.title)}" width="1280" height="720" decoding="async" onerror="if(this.dataset.full){this.src=this.dataset.full;this.dataset.full=''}else{this.parentNode.remove()}"></figure>` : ""}
      ${body.toc.length >= 3 ? `<nav class="post-toc" aria-labelledby="postToc"><strong id="postToc">On this page</strong><ol>${body.toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ol></nav>` : ""}
      ${body.html}
      ${b.tags.length ? `<p class="post-tags">${b.tags.map(t => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
      <aside class="blog-cta">
        <strong>Interested in ${esc(p.name)}?</strong>
        <span>See prices, floor plans, amenities and RERA details.</span>
        <a class="btn-primary" href="${projectHref}">View ${esc(p.name)} →</a>
      </aside>`;

    const img = p.images && p.images[0];
    $("bpAside").innerHTML = `
      <aside class="post-project" aria-label="About ${esc(p.name)}">
        ${img ? `<a class="post-project-photo" href="${projectHref}"><img src="${esc(img.large || img.url)}" onerror="this.onerror=null;this.src='${esc(img.url)}'" alt="${esc(img.alt || p.name)}" loading="lazy" decoding="async"></a>` : ""}
        <div class="post-project-body">
          ${p.status ? `<span class="post-project-status">${esc(p.status)}</span>` : ""}
          <h2><a href="${projectHref}">${esc(p.name)}</a></h2>
          ${p.location ? `<p class="post-project-where">${esc(p.location)}</p>` : ""}
          ${p.developer ? `<p class="post-project-dev">by ${esc(p.developer)}</p>` : ""}
          <p class="post-project-price">${esc(p.startingPriceText)}${p.startingPrice ? " <small>onwards</small>" : ""}</p>
          <a class="btn-primary" href="${projectHref}">View project details →</a>
          <a class="post-project-enquire" href="${projectHref}#enquiryWrap">Enquire about price &amp; site visit</a>
        </div>
      </aside>`;
  }

  async function load(){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(projectSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(postSlug)){
      fail("This article link is not valid.");
      return;
    }
    try{
      const { data, error } = await supabasePublic
        .from(KIND.table).select(KIND.select)
        .eq("slug", projectSlug).eq("moderation_status", "published").is("deleted_at", null)
        .maybeSingle();
      if(error) throw error;
      if(!data){ fail("This project is not available."); return; }
      const p = P.normalizeProject(data, { supabaseUrl: SUPABASE_URL, root: ROOT, kind: KIND.kind });
      const b = (p.blogs || []).find(x => x.slug === postSlug);
      if(!b){ fail("This article is not published.", `${ROOT}${KIND.base}/${p.slug}/`); return; }
      draw(p, b);
    }catch(err){
      console.error("Keys99 article error:", err);
      fail("Unable to load the article. Please try again.");
    }
  }

  load();
})();

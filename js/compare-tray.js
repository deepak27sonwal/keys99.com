/* =========================================================
   KEYS99 - COMPARE TRAY

   Loaded on every page with project cards and on project pages.
   Any button with data-compare-slug (and data-compare-name) adds or
   removes that project from the comparison list (up to 3, kept in
   this browser). A bar at the bottom of the screen shows the
   selection and links to projects/compare.html?p=a,b,c.
========================================================= */

(function(){
  var KEY = "k99_compare";
  var MAX = 3;

  /* Path from this page to the site root, read off this script's own
     src ("../../js/compare-tray.js" -> "../../"). */
  var script = document.currentScript;
  var ROOT = script ? (script.getAttribute("src") || "").replace(/js\/compare-tray\.js.*$/, "") : "";

  function read(){
    try{
      var list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list.filter(function(p){ return p && /^[a-z0-9-]+$/.test(p.slug); }).slice(0, MAX) : [];
    }catch(_){ return []; }
  }
  /* A project is its slug plus its kind: commercial projects are
     written "commercial:<slug>" (in the compare link too), homes as
     the bare slug, as before. */
  function idOf(p){ return (p.kind === "commercial" ? "commercial:" : "") + p.slug; }
  function btnId(btn){ return (btn.dataset.compareKind === "commercial" ? "commercial:" : "") + btn.dataset.compareSlug; }

  function write(list){
    try{ localStorage.setItem(KEY, JSON.stringify(list)); }catch(_){}
  }

  var css = document.createElement("style");
  css.textContent =
    ".compare-tray{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + var(--tray-offset,0px));z-index:450;" +
      "width:min(760px,calc(100% - 24px));display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;" +
      "background:#082d38;color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.28);font-family:inherit}" +
    ".compare-tray[hidden]{display:none}" +
    ".compare-tray-items{display:flex;gap:6px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}" +
    ".compare-tray-items::-webkit-scrollbar{display:none}" +
    ".compare-tray-chip{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:180px;padding:6px 6px 6px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;font-weight:600}" +
    ".compare-tray-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".compare-tray-chip button{width:20px;height:20px;border:0;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font-size:13px;line-height:1;cursor:pointer;flex:none}" +
    ".compare-tray-go{flex:none;padding:10px 14px;border-radius:10px;background:#e1a400;color:#082d38;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap}" +
    ".compare-tray-go[aria-disabled=true]{opacity:.55;pointer-events:none}" +
    ".compare-tray-clear{flex:none;border:0;background:none;color:rgba(255,255,255,.75);font-size:12px;font-weight:600;cursor:pointer;padding:6px}" +
    ".compare-tray-note{position:absolute;left:12px;right:12px;bottom:calc(100% + 8px);padding:8px 12px;border-radius:10px;background:#c0392b;color:#fff;font-size:12px;font-weight:600;text-align:center}" +
    ".compare-tray-note[hidden]{display:none}" +
    /* The chat bubble moves up while the bar is showing. */
    ".has-compare-tray .cw-launcher{transform:translateY(calc(-1 * var(--compare-tray-lift,0px)));transition:transform .2s}" +
    "@media (max-width:560px){.compare-tray{bottom:calc(10px + var(--tray-offset,0px));gap:8px;padding:8px 10px}.compare-tray-chip{max-width:120px}}";
  document.head.appendChild(css);

  var tray = document.createElement("div");
  tray.className = "compare-tray";
  tray.hidden = true;
  tray.setAttribute("role", "region");
  tray.setAttribute("aria-label", "Projects to compare");
  tray.innerHTML =
    '<p class="compare-tray-note" hidden></p>' +
    '<div class="compare-tray-items"></div>' +
    '<button type="button" class="compare-tray-clear">Clear</button>' +
    '<a class="compare-tray-go" href="#">Compare</a>';

  var noteTimer;
  function note(text){
    var el = tray.querySelector(".compare-tray-note");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function(){ el.hidden = true; }, 2600);
  }

  function esc(v){
    return String(v).replace(/[&<>"']/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; });
  }

  /* Keep the bar above the site's own bottom bars (mobile nav, the
     project page's call/WhatsApp bar). */
  function placeTray(){
    var top = window.innerHeight;
    document.querySelectorAll(".bottom-nav, .sticky-contact-bar").forEach(function(el){
      var style = getComputedStyle(el);
      if(style.display === "none" || style.position !== "fixed") return;
      var rect = el.getBoundingClientRect();
      if(rect.height && rect.top < top) top = rect.top;
    });
    tray.style.setProperty("--tray-offset", Math.max(0, window.innerHeight - top) + "px");
    document.documentElement.style.setProperty("--compare-tray-lift", (tray.offsetHeight + 12) + "px");
  }

  /* The compare page shows the selection itself. */
  var ON_COMPARE_PAGE = /\/compare(\.html)?$/.test(location.pathname);

  function render(){
    var list = read();
    document.querySelectorAll("[data-compare-slug]").forEach(function(btn){
      var on = list.some(function(p){ return idOf(p) === btnId(btn); });
      var label = on ? "✓ Comparing" : "⇄ Compare";
      /* Only touch what changed: the observer below would otherwise
         see every rewrite as new content and render forever. */
      if(btn.getAttribute("aria-pressed") !== String(on)) btn.setAttribute("aria-pressed", String(on));
      if(btn.classList.contains("is-compared") !== on) btn.classList.toggle("is-compared", on);
      if(btn.textContent !== label) btn.textContent = label;
    });

    tray.hidden = !list.length || ON_COMPARE_PAGE;
    document.documentElement.classList.toggle("has-compare-tray", !tray.hidden);
    tray.querySelector(".compare-tray-items").innerHTML = list.map(function(p){
      return '<span class="compare-tray-chip"><span>' + esc(p.name || p.slug) + '</span>' +
        '<button type="button" data-remove="' + esc(idOf(p)) + '" aria-label="Remove ' + esc(p.name || p.slug) + '">×</button></span>';
    }).join("");
    var go = tray.querySelector(".compare-tray-go");
    go.href = ROOT + "projects/compare?p=" + list.map(idOf).join(",");
    go.textContent = list.length < 2 ? "Add one more" : "Compare (" + list.length + ") →";
    go.setAttribute("aria-disabled", list.length < 2 ? "true" : "false");
    if(!tray.hidden) placeTray();
  }

  function toggle(slug, name, kind){
    var list = read();
    var entry = { slug: slug, name: name || slug, kind: kind === "commercial" ? "commercial" : "residential" };
    var i = list.findIndex(function(p){ return idOf(p) === idOf(entry); });
    if(i > -1){
      list.splice(i, 1);
    }else if(list.length >= MAX){
      note("You can compare up to " + MAX + " projects. Remove one first.");
      return;
    }else{
      list.push(entry);
    }
    write(list);
    render();
  }

  /* Capture phase, so the click never reaches the card's own handler
     (which would open the project) or the photo's lightbox. */
  document.addEventListener("click", function(e){
    var btn = e.target.closest && e.target.closest("[data-compare-slug]");
    if(!btn || !btn.dataset.compareSlug) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(btn.dataset.compareSlug, btn.dataset.compareName, btn.dataset.compareKind);
  }, true);

  tray.addEventListener("click", function(e){
    var remove = e.target.closest("[data-remove]");
    if(remove){
      write(read().filter(function(p){ return idOf(p) !== remove.dataset.remove; }));
      render();
    }else if(e.target.closest(".compare-tray-clear")){
      write([]);
      render();
    }
  });

  /* Other tabs, and cards the page draws later (the homepage refreshes
     its cards from the database after loading). */
  window.addEventListener("storage", function(e){ if(e.key === KEY) render(); });
  window.addEventListener("resize", function(){ if(!tray.hidden) placeTray(); });
  window.addEventListener("pageshow", render);
  var pending;
  new MutationObserver(function(records){
    if(records.every(function(r){ return tray.contains(r.target); })) return;
    clearTimeout(pending);
    pending = setTimeout(render, 50);
  }).observe(document.body, { childList: true, subtree: true });

  /* Number of saved (hearted) projects on the header's Saved button. */
  function savedCount(){
    var n = 0;
    try{ n = (JSON.parse(localStorage.getItem("keys99_favorites") || "[]") || []).length; }catch(_){}
    document.querySelectorAll("[data-saved-count]").forEach(function(el){
      el.textContent = n;
      el.hidden = !n;
    });
  }
  window.addEventListener("storage", function(e){ if(e.key === "keys99_favorites") savedCount(); });
  /* Capture phase: the heart buttons stop their click from bubbling.
     The count is read just after their own handler has saved. */
  document.addEventListener("click", function(e){
    if(e.target.closest && e.target.closest(".fav, #favoriteBtn, [data-fav]")) setTimeout(savedCount, 0);
  }, true);
  savedCount();

  document.body.appendChild(tray);
  window.Keys99Compare = { list: read, toggle: toggle, refresh: render };
  render();
})();

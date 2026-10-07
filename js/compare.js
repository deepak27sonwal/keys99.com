/* =========================================================
   KEYS99 - COMPARE PAGE BEHAVIOUR  (projects/compare.html)

   Reads ?p=slug1,slug2,slug3 (commercial projects as
   commercial:<slug>), loads those published projects live
   from Supabase with the project page's own query and normaliser
   (js/project-core.js), and draws them side by side. The lowest
   starting price and price per sq ft are marked.
========================================================= */

(function(){
  const P = window.Keys99Project;
  const ROOT = document.body.dataset.root || "../";
  const MAX = 3;
  const $ = id => document.getElementById(id);
  const e = v => P.escapeHtml(v == null ? "" : String(v));

  /* "slug" is a home, "commercial:slug" a commercial project. */
  const picks = [...new Set((new URLSearchParams(location.search).get("p") || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(s => /^(?:commercial:)?[a-z0-9-]+$/.test(s)))].slice(0, MAX)
    .map(id => ({ id, kind: id.startsWith("commercial:") ? "commercial" : "residential", slug: id.replace(/^commercial:/, "") }));
  const slugs = picks.map(p => p.id);
  const idOf = p => (p.kind === "commercial" ? "commercial:" : "") + p.slug;

  function showEmpty(){
    $("compareStatus").hidden = true;
    $("compareScroll").hidden = true;
    $("compareEmpty").hidden = false;
  }

  const fact = (p, label) => (p.facts.find(f => f.label === label) || {}).value || "";

  /* "455 – 854 Sq.Ft" from the configurations' carpet areas. */
  function areaRange(p){
    const areas = p.configurations.map(c => c.area).filter(Boolean);
    if(!areas.length) return "";
    const unit = areas[0].replace(/^[\d,.\s]+/, "");
    const nums = areas.filter(a => a.endsWith(unit)).map(a => parseFloat(a.replace(/,/g, "")));
    if(!nums.length) return areas[0];
    const lo = Math.min(...nums), hi = Math.max(...nums);
    const fmt = n => n.toLocaleString("en-IN");
    return (hi > lo ? `${fmt(lo)} – ${fmt(hi)}` : fmt(lo)) + " " + unit;
  }

  const minRate = p => {
    const rates = p.configurations.map(c => c.rate).filter(Boolean);
    return rates.length ? Math.min(...rates) : null;
  };

  function render(projects){
    const priceBest = Math.min(...projects.map(p => p.startingPrice || Infinity));
    const rateBest = Math.min(...projects.map(p => minRate(p) || Infinity));
    const lowest = '<span class="compare-best">Lowest</span>';
    const several = projects.length > 1;

    const rows = [
      ["Starting price", p => p.startingPrice
        ? e(p.startingPriceText) + (several && p.startingPrice === priceBest ? lowest : "") : "Price on Request"],
      ["Price / Sq.Ft", p => fact(p, "Price / Sq.Ft")
        ? e(fact(p, "Price / Sq.Ft")) + (several && minRate(p) === rateBest ? lowest : "") : "—"],
      ["BHK / Unit types", p => e(p.configLabels.join(", ") || "—")],
      ["Carpet area", p => e(areaRange(p) || "—")],
      ["Status", p => p.status ? `<span class="compare-status-tag ${e(p.statusClass)}">${e(p.status)}</span>` : "—"],
      ["Possession", p => e(p.possession || "—")],
      ["RERA number", p => e(p.rera || "Not listed")],
      ["Developer", p => e(p.developer || "—")],
      ["Location", p => e(p.location || "—")],
      ["Towers", p => e(fact(p, "Towers") || "—")],
      ["Floors", p => e(fact(p, "Floors") || "—")],
      ["Total units", p => e(fact(p, "Total Units") || "—")],
      ["Land area", p => e(fact(p, "Land Area") || "—")],
      ["Amenities", p => p.amenities.length
        ? `<strong>${p.amenities.length}</strong><span class="compare-amenities">${e(p.amenities.slice(0, 8).map(a => a.name).join(", "))}${p.amenities.length > 8 ? "…" : ""}</span>`
        : "—"]
    ];

    const head = projects.map(p => {
      const img = p.images[0];
      const url = `${ROOT}${p.basePath || "projects"}/${encodeURIComponent(p.slug)}/`;
      return `
        <th scope="col">
          <div class="compare-head">
            <button type="button" class="compare-remove" data-remove="${e(idOf(p))}" aria-label="Remove ${e(p.name)}">×</button>
            <a class="compare-photo" href="${e(url)}">
              <img src="${e(img ? img.card : ROOT + "assets/property-placeholder.svg")}"${img ? ` data-full="${e(img.url)}"` : ""}
                onerror="${P.IMG_FALLBACK}" alt="${e(p.name)}" width="400" height="300" loading="lazy">
            </a>
            <a class="compare-name" href="${e(url)}">${e(p.name)}</a>
            <span class="compare-place">${e([p.locality, p.city].filter(Boolean).join(", "))}</span>
          </div>
        </th>`;
    }).join("");

    const body = rows.map(([label, cell]) => `
      <tr>
        <th scope="row">${e(label)}</th>
        ${projects.map(p => `<td>${cell(p)}</td>`).join("")}
      </tr>`).join("");

    const actions = `
      <tr class="compare-actions">
        <th scope="row"></th>
        ${projects.map(p => {
          const url = `${ROOT}${p.basePath || "projects"}/${encodeURIComponent(p.slug)}/`;
          return `<td>
            <a class="btn-primary" href="${e(url)}#schedule-visit">Schedule Visit</a>
            <a class="compare-view" href="${e(url)}">View project →</a>
          </td>`;
        }).join("")}
      </tr>`;

    $("compareTable").innerHTML = `
      <thead><tr><th scope="col" class="compare-corner"><span>${projects.length} projects</span></th>${head}</tr></thead>
      <tbody>${body}${actions}</tbody>`;
    $("compareTable").style.setProperty("--cols", projects.length);
    $("compareStatus").hidden = true;
    $("compareScroll").hidden = false;
    $("compareEmpty").hidden = true;
    document.title = `Compare ${projects.map(p => p.name).join(" vs ")} | Keys99`;
  }

  /* Removing a column updates the address, the tray and the table. */
  let current = [];
  $("compareTable").addEventListener("click", ev => {
    const btn = ev.target.closest("[data-remove]");
    if(!btn) return;
    const id = btn.dataset.remove;
    const gone = current.find(p => idOf(p) === id);
    current = current.filter(p => idOf(p) !== id);
    if(gone && window.Keys99Compare && window.Keys99Compare.list().some(p => (p.kind === "commercial" ? "commercial:" : "") + p.slug === id)){
      window.Keys99Compare.toggle(gone.slug, gone.name, gone.kind);
    }
    const query = current.map(idOf).join(",");
    history.replaceState(null, "", location.pathname + (query ? "?p=" + query : ""));
    if(current.length < 2) showEmpty();
    else render(current);
  });

  async function load(){
    if(slugs.length < 2 || typeof supabaseClient === "undefined" || !P){
      if(slugs.length < 2) return showEmpty();
      $("compareStatus").textContent = "Could not load projects. Please try again later.";
      return;
    }
    try{
      /* One query per kind, each from its own table. */
      const bySlug = new Map();
      await Promise.all(["residential", "commercial"].map(async kind => {
        const wanted = picks.filter(p => p.kind === kind).map(p => p.slug);
        if(!wanted.length) return;
        const K = P.KINDS[kind];
        const { data, error } = await supabaseClient
          .from(K.table)
          .select(K.select)
          .in("slug", wanted)
          .eq("moderation_status", "published")
          .is("deleted_at", null);
        if(error) throw error;
        (data || []).forEach(row => {
          const p = P.normalizeProject(row, { supabaseUrl: SUPABASE_URL, root: ROOT, kind });
          bySlug.set(idOf(p), p);
        });
      }));
      current = slugs.map(s => bySlug.get(s)).filter(Boolean);

      /* Projects no longer listed drop out of the tray too. */
      const gone = picks.filter(p => !bySlug.has(p.id));
      if(gone.length && window.Keys99Compare){
        gone.forEach(g => { if(window.Keys99Compare.list().some(p => (p.kind === "commercial" ? "commercial:" : "") + p.slug === g.id)) window.Keys99Compare.toggle(g.slug, "", g.kind); });
      }

      if(current.length < 2) return showEmpty();
      render(current);
      if(gone.length){
        $("compareIntro").textContent = `${gone.length === 1 ? "One project you picked is" : "Some projects you picked are"} no longer listed and ${gone.length === 1 ? "has" : "have"} been left out.`;
      }
    }catch(error){
      console.error("Compare failed:", error);
      $("compareStatus").textContent = "Could not load projects. Please check your connection and try again.";
    }
  }

  load();
})();

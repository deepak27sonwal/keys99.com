/* =========================================================
   KEYS99 - SEARCH PAGE BEHAVIOUR
   Every published project is already on the page as a card
   (build/search.js). This filters and sorts them from the form,
   keeps the address bar in sync, and accepts the same query
   string the homepage sends:
     q, type, bhk, city, locality, status, minPrice, maxPrice, sort
========================================================= */

(function(){

  const form = document.getElementById("searchFilters");
  const results = document.getElementById("searchResults");
  if(!form || !results) return;

  const cards = [...results.querySelectorAll(".property-card")];
  const countEl = document.getElementById("searchCount");
  const emptyEl = document.getElementById("searchEmpty");
  const emptyNote = document.getElementById("searchEmptyNote");
  const heading = document.getElementById("searchHeading");
  const citySel = document.getElementById("sfCity");
  const localitySel = document.getElementById("sfLocality");

  const FIELDS = ["q", "city", "locality", "bhk", "type", "minPrice", "maxPrice", "sort", "status"];

  const slug = v => String(v || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  /* Homepage sends display names ("Pune", "2 bhk"); cards carry slugs. */
  function readParams(){
    const params = new URLSearchParams(location.search);
    const values = {};
    FIELDS.forEach(f => { values[f] = (params.get(f) || "").trim(); });
    values.city = slug(values.city);
    values.locality = slug(values.locality);
    values.bhk = values.bhk.toLowerCase().replace(/\s+/g, " ");
    return values;
  }

  function setControl(name, value){
    const el = form.elements[name];
    if(!el) return;
    if(el.tagName === "SELECT" && value && ![...el.options].some(o => o.value === value)){
      return;                                    // unknown value: leave "any"
    }
    el.value = value;
  }

  function syncLocalities(){
    const city = citySel.value;
    [...localitySel.options].forEach(o => {
      if(!o.value) return;
      o.hidden = !!city && o.dataset.city !== city;
    });
    const current = localitySel.options[localitySel.selectedIndex];
    if(current && current.hidden) localitySel.value = "";
  }

  function values(){
    const v = {};
    FIELDS.forEach(f => { v[f] = form.elements[f] ? String(form.elements[f].value || "").trim() : ""; });
    return v;
  }

  function matches(card, v){
    const d = card.dataset;
    if(v.q){
      const text = d.search || "";
      if(!v.q.toLowerCase().split(/\s+/).every(word => text.includes(word))) return false;
    }
    if(v.city && d.city !== v.city) return false;
    if(v.locality && d.locality !== v.locality) return false;
    if(v.type && d.type !== v.type) return false;
    if(v.bhk){
      const list = (d.bhks || "").split("|").filter(Boolean);
      if(v.bhk === "4+ bhk"){
        if(!list.some(b => parseFloat(b) >= 4)) return false;
      }else if(!list.includes(v.bhk)){
        return false;
      }
    }
    const price = d.price ? Number(d.price) : null;
    if(v.minPrice && (price === null || price < Number(v.minPrice))) return false;
    if(v.maxPrice && (price === null || price > Number(v.maxPrice))) return false;
    return true;
  }

  function sortCards(list, sort){
    const priceOf = c => c.dataset.price ? Number(c.dataset.price) : null;
    const dateOf = c => Date.parse(c.dataset.created || "") || 0;
    return list.slice().sort((a, b) => {
      if(sort === "price-asc" || sort === "price-desc"){
        const pa = priceOf(a), pb = priceOf(b);
        if(pa === null && pb === null) return dateOf(b) - dateOf(a);
        if(pa === null) return 1;                  // "on request" last
        if(pb === null) return -1;
        return sort === "price-asc" ? pa - pb : pb - pa;
      }
      return dateOf(b) - dateOf(a);
    });
  }

  function label(select){
    const o = select && select.options[select.selectedIndex];
    return o && o.value ? o.textContent : "";
  }

  function apply(push){
    const v = values();

    /* Projects are new homes for sale; there are no rentals yet. */
    const rentals = v.status === "rent";
    const visible = rentals ? [] : cards.filter(c => matches(c, v));

    cards.forEach(c => { c.hidden = !visible.includes(c); });
    sortCards(visible, v.sort).forEach(c => results.appendChild(c));

    countEl.textContent = `${visible.length} ${visible.length === 1 ? "project" : "projects"} found`;
    emptyEl.hidden = visible.length > 0;
    emptyNote.textContent = rentals
      ? "Keys99 lists new projects for sale - rental listings are coming soon."
      : "Try removing a filter or widening the price range.";

    const where = label(localitySel) || label(citySel);
    const bhk = label(document.getElementById("sfBhk"));
    heading.textContent = where
      ? `${bhk ? bhk + " " : ""}Projects in ${where}`
      : (bhk ? `${bhk} Projects` : "Search Projects");

    const query = new URLSearchParams();
    Object.entries(v).forEach(([k, val]) => { if(val && !(k === "sort" && val === "newest")) query.set(k, val); });
    const url = location.pathname + (query.toString() ? "?" + query : "");
    history[push ? "pushState" : "replaceState"](null, "", url);

    /* Cards that were hidden when the BHK rows were sized need it again. */
    window.dispatchEvent(new Event("resize"));
  }

  function load(){
    const p = readParams();
    FIELDS.forEach(f => { if(f !== "locality") setControl(f, p[f]); });
    syncLocalities();
    setControl("locality", p.locality);
    if(!form.elements.sort.value) form.elements.sort.value = "newest";
    apply(false);
  }

  let typingTimer;
  form.addEventListener("input", e => {
    if(e.target.name === "q"){
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => apply(false), 200);
    }
  });
  form.addEventListener("change", e => {
    if(e.target.name === "city") syncLocalities();
    apply(false);
  });
  form.addEventListener("submit", e => { e.preventDefault(); apply(true); });

  function clearAll(){
    form.reset();
    form.elements.status.value = "";
    syncLocalities();
    form.elements.sort.value = "newest";
    apply(true);
  }
  form.addEventListener("reset", e => { e.preventDefault(); clearAll(); });
  document.getElementById("searchReset").addEventListener("click", clearAll);

  window.addEventListener("popstate", load);
  load();

})();

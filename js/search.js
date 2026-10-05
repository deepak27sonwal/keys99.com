/* =========================================================
   KEYS99 - SEARCH PAGE BEHAVIOUR
   Every published project is already on the page as a card
   (build/search.js). This filters and sorts them from the form,
   keeps the address bar in sync, and accepts the same query
   string the homepage sends:
     q, type, bhk, city, locality, status, minPrice, maxPrice, sort

   Typed words tolerate small typos ("hinjawadi" finds Hinjewadi),
   with the same rules as the homepage search, and the box suggests
   matching cities, localities, developers and projects.
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

  /* Words of a typed search, as the cards' data-search text has them:
     lower case, punctuation dropped ("Rau, Indore" -> rau indore;
     "2.5" keeps its point), and filler words that describe every
     listing ("flats", "apartment", "in") left out. */
  const FILLER = new Set(["flat", "flats", "apartment", "apartments", "property", "properties",
    "home", "homes", "house", "houses", "in", "at", "for", "near", "and", "the", "of"]);
  function queryWords(q){
    return String(q || "").toLowerCase()
      .replace(/[^a-z0-9.\s]+/g, " ")
      .split(/\s+/)
      .map(w => w.replace(/^\.+|\.+$/g, ""))
      .filter(w => w && !FILLER.has(w));
  }

  /* Edit distance for word-length strings. */
  function distance(a, b){
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for(let i = 1; i <= a.length; i++){
      let prev = row[0];
      row[0] = i;
      for(let j = 1; j <= b.length; j++){
        const cur = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
      }
    }
    return row[b.length];
  }

  /* 2 = the word is in the text, 1 = a near-miss of one of its words
     (1 letter off up to 6 letters, 2 beyond; numbers must match
     exactly), 0 = not found. */
  function wordScore(word, text, words){
    if(/^\d+$/.test(word)) return new RegExp("(?<!\\d)" + word + "(?!\\d)").test(text) ? 2 : 0;
    if(text.includes(word)) return 2;
    const allowed = word.length <= 3 ? 0 : word.length <= 6 ? 1 : 2;
    if(!allowed) return 0;
    return words.some(w => distance(w.slice(0, word.length + allowed), word) <= allowed) ? 1 : 0;
  }

  const wordsOf = text => text.split(/[^a-z0-9.]+/).filter(Boolean);

  function matches(card, v){
    const d = card.dataset;
    if(v.q){
      const text = d.search || "";
      if(!card._words) card._words = wordsOf(text);
      if(!queryWords(v.q).every(word => wordScore(word, text, card._words))) return false;
    }
    if(v.city && d.city !== v.city) return false;
    if(v.locality && d.locality !== v.locality) return false;
    /* "resale" is a listing type across categories (data-listing);
       the rest are categories (data-type). */
    if(v.type === "resale"){
      if(d.listing !== "resale") return false;
    }else if(v.type && d.type !== v.type){
      return false;
    }
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
    const rentals = v.status === "rent" || v.type === "rent";
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
    const noun = v.type === "resale" ? "Resale Homes" : rentals ? "Homes for Rent" : "Projects";
    heading.textContent = where
      ? `${bhk ? bhk + " " : ""}${noun} in ${where}`
      : (bhk ? `${bhk} ${noun}` : (noun === "Projects" ? "Search Projects" : noun));

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

  /* ---------- Suggestions under the search box ---------- */

  const input = form.elements.q;
  const box = document.getElementById("sfSuggest");
  if(!input || !box) return;

  const esc = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const optionLabel = (sel, value) => { const o = [...sel.options].find(x => x.value === value); return o ? o.textContent.trim() : ""; };

  /* Built once from what is on the page: the city and locality
     lists, and each card's project name, link and developer. */
  const pool = [];
  [...citySel.options].filter(o => o.value).forEach(o => pool.push({ kind: "City", icon: "⌖", label: o.textContent.trim(), city: o.value }));
  [...localitySel.options].filter(o => o.value).forEach(o => {
    const city = optionLabel(citySel, o.dataset.city);
    pool.push({ kind: "Locality", icon: "⌖", label: o.textContent.trim() + (city ? ", " + city : ""), city: o.dataset.city, locality: o.value });
  });
  const bhkSel = document.getElementById("sfBhk");
  if(bhkSel) [...bhkSel.options].filter(o => o.value).forEach(o => {
    pool.push({ kind: "BHK", icon: "▣", label: o.textContent.trim() + " Flats", bhk: o.value });
  });
  const developers = new Set();
  cards.forEach(c => {
    const link = c.querySelector(".card-link");
    const dev = (c.querySelector(".developer") || {}).textContent || "";
    const devName = dev.replace(/^\s*By\s*/i, "").replace(/\s+/g, " ").trim();
    if(link){
      const where = [optionLabel(localitySel, c.dataset.locality), optionLabel(citySel, c.dataset.city)].filter(Boolean).join(", ");
      pool.push({ kind: "Project", icon: "⌂", label: link.textContent.trim(), sub: where, href: link.href, extra: devName });
    }
    if(devName && !developers.has(devName.toLowerCase())){
      developers.add(devName.toLowerCase());
      pool.push({ kind: "Developer", icon: "▥", label: devName });
    }
  });
  pool.forEach(item => {
    item.text = [item.label, item.sub, item.extra].filter(Boolean).join(" ").toLowerCase();
    item.words = wordsOf(item.text);
  });
  const ORDER = { Project: 0, Locality: 1, City: 2, BHK: 3, Developer: 4 };

  let shown = [];
  let active = -1;

  function close(){
    box.hidden = true;
    box.innerHTML = "";
    shown = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function suggest(){
    const words = queryWords(input.value);
    if(!words.length || input.value.trim().length < 2){ close(); return; }
    shown = pool.map(item => {
      let score = 0;
      for(const w of words){
        const s = wordScore(w, item.text, item.words);
        if(!s) return null;
        score += s;
      }
      if(item.label.toLowerCase().startsWith(words[0])) score += 1;
      return { item, score };
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || ORDER[a.item.kind] - ORDER[b.item.kind] || a.item.label.localeCompare(b.item.label))
      .slice(0, 8)
      .map(x => x.item);
    if(!shown.length){ close(); return; }
    active = -1;
    box.innerHTML = shown.map((item, i) => `
      <div class="suggest-item" id="sfSuggest${i}" role="option" data-index="${i}">
        <span class="suggest-icon" aria-hidden="true">${item.icon}</span>
        <span>${esc(item.label)}${item.sub ? ` <small class="suggest-sub">${esc(item.sub)}</small>` : ""}</span>
        <span class="suggest-type">${esc(item.kind)}</span>
      </div>`).join("");
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function highlight(i){
    const items = box.querySelectorAll(".suggest-item");
    items.forEach((el, n) => { el.classList.toggle("active", n === i); el.setAttribute("aria-selected", String(n === i)); });
    active = i;
    if(items[i]){
      input.setAttribute("aria-activedescendant", items[i].id);
      items[i].scrollIntoView({ block: "nearest" });
    }
  }

  /* A project opens its page; a city, locality or BHK size becomes
     that filter (its name is not searched as text); a developer is
     searched by name. */
  function choose(item){
    close();
    if(item.kind === "Project"){ location.href = item.href; return; }
    if(item.kind === "City" || item.kind === "Locality"){
      input.value = "";
      citySel.value = item.city || "";
      syncLocalities();
      localitySel.value = item.locality || "";
    }else if(item.kind === "BHK"){
      input.value = "";
      bhkSel.value = item.bhk;
    }else{
      input.value = item.label;
    }
    apply(true);
  }

  input.addEventListener("input", suggest);
  input.addEventListener("focus", suggest);
  input.addEventListener("keydown", e => {
    if(box.hidden) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); highlight((active + 1) % shown.length); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); highlight((active - 1 + shown.length) % shown.length); }
    else if(e.key === "Enter" && active >= 0){ e.preventDefault(); choose(shown[active]); }
    else if(e.key === "Escape"){ close(); }
  });
  /* mousedown, not click: runs before the input loses focus. */
  box.addEventListener("mousedown", e => {
    const el = e.target.closest(".suggest-item");
    if(!el) return;
    e.preventDefault();
    choose(shown[Number(el.dataset.index)]);
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  form.addEventListener("submit", close);

})();

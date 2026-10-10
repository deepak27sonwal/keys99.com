/* =========================================================
   KEYS99 - MY REQUIREMENTS + RECOMMENDED FOR YOU (profile.html)

   Two sections, Residential and Commercial, saved on the visitor's
   profile row (req_residential, req_commercial - see
   supabase/13-profile-requirements.sql) through
   Keys99Account.updateRequirements. The team sees them with the
   visitor's name and number; the page uses them to pick matching
   projects from the cards in #recoPool:

   Residential tab     residential cards in the chosen cities, scored
                       on size (BHK), budget, possession and locality.
   Commercial tab      commercial cards in the chosen cities, scored
                       on sale/lease, budget, possession and locality.
   Recently viewed tab the projects this browser opened last.
   Each tab is a sideways scroller of cards.
========================================================= */

(function(){
  const account = window.Keys99Account;
  const $ = id => document.getElementById(id);
  const body = $("reqBody");
  const pool = $("recoPool");
  if(!account || !body || !pool) return;

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  /* ---------- choices ---------- */
  const KNOWN_CITIES = ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Gurugram", "Noida", "Ahmedabad", "Indore"];
  const cards = [...pool.querySelectorAll(".property-card")];
  const titleCase = s => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const CITIES = (() => {
    const names = new Map(KNOWN_CITIES.map(n => [slug(n), n]));
    cards.forEach(c => { const k = c.dataset.city; if(k && !names.has(k)) names.set(k, titleCase(k)); });
    return [...names.values()];
  })();

  const lakh = n => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : `₹${+(n / 1e5).toFixed(2)} L`;
  const rent = n => n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L/month` : `₹${Math.round(n / 1e3)}K/month`;
  const SALE_STEPS = [1e6, 2e6, 3e6, 4e6, 5e6, 7.5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7, 1e8];
  const RENT_STEPS = [1e4, 1.5e4, 2e4, 3e4, 5e4, 7.5e4, 1e5, 2e5, 3e5, 5e5, 1e6];
  const TIMELINE = [["immediately", "Immediately"], ["3_months", "Within 3 months"], ["6_months", "Within 6 months"], ["1_year", "Within a year"], ["exploring", "Just exploring"]];
  const POSSESSION = [["ready", "Ready to move"], ["under_construction", "Under construction"], ["any", "Any"]];

  const SECTIONS = {
    residential: {
      title: "home",
      fields: [
        { key: "deal", label: "Looking to", kind: "one", options: [["buy", "Buy"], ["rent", "Rent"]] },
        { key: "types", label: "Property type", kind: "many", options: [["apartment", "Apartment"], ["villa", "Villa"], ["row_house", "Row House"], ["penthouse", "Penthouse"], ["studio", "Studio"], ["plot", "Plot"]] },
        { key: "cities", label: "City", kind: "many", options: CITIES.map(c => [c, c]) },
        { key: "localities", label: "Preferred localities", kind: "text", placeholder: "e.g. Hinjewadi, Wakad, Baner" },
        { key: "bhk", label: "Size", kind: "many", options: ["1 BHK", "2 BHK", "3 BHK", "4 BHK", "5+ BHK"].map(b => [b, b]) },
        { key: "budget", label: "Budget", kind: "range" },
        { key: "possession", label: "Possession", kind: "one", options: POSSESSION },
        { key: "purpose", label: "Purpose", kind: "one", options: [["self_use", "To live in"], ["investment", "Investment"]] },
        { key: "timeline", label: "When do you plan to buy?", kind: "select", options: TIMELINE },
        { key: "home_loan", label: "Home loan needed?", kind: "one", options: [["yes", "Yes"], ["no", "No"]] },
        { key: "notes", label: "Anything else?", kind: "textarea", placeholder: "e.g. near metro, east facing, school nearby" }
      ]
    },
    commercial: {
      title: "commercial",
      fields: [
        { key: "deal", label: "Looking to", kind: "one", options: [["buy", "Buy"], ["lease", "Lease / Rent"]] },
        { key: "types", label: "Property type", kind: "many", options: [["office", "Office"], ["shop", "Shop"], ["showroom", "Showroom"], ["warehouse", "Warehouse"], ["industrial", "Industrial"], ["coworking", "Co-working"], ["commercial_land", "Land"]] },
        { key: "cities", label: "City", kind: "many", options: CITIES.map(c => [c, c]) },
        { key: "localities", label: "Preferred localities", kind: "text", placeholder: "e.g. Hinjewadi, Baner, Kharadi" },
        { key: "area", label: "Area (sq ft)", kind: "area" },
        { key: "budget", label: "Budget", kind: "range" },
        { key: "possession", label: "Possession", kind: "one", options: POSSESSION },
        { key: "purpose", label: "Purpose", kind: "one", options: [["own_use", "Own use"], ["investment", "Investment"]] },
        { key: "timeline", label: "When do you need it?", kind: "select", options: TIMELINE },
        { key: "notes", label: "Anything else?", kind: "textarea", placeholder: "e.g. ground floor, parking, frontage" }
      ]
    }
  };

  const isRent = (section, data) => data && (data.deal === "rent" || data.deal === "lease");
  const money = (section, data, n) => isRent(section, data) ? rent(n) : lakh(n);
  const optionLabel = (field, value) => (field.options.find(o => o[0] === value) || [value, value])[1];

  /* ---------- summary ---------- */
  function summary(section, data){
    const parts = [];
    SECTIONS[section].fields.forEach(f => {
      if(f.kind === "range"){
        const lo = data.budget_min, hi = data.budget_max;
        if(lo || hi) parts.push(lo && hi ? `${money(section, data, lo)} – ${money(section, data, hi)}` : lo ? `From ${money(section, data, lo)}` : `Up to ${money(section, data, hi)}`);
      }else if(f.kind === "area"){
        const lo = data.area_min, hi = data.area_max;
        if(lo || hi) parts.push(lo && hi ? `${lo.toLocaleString("en-IN")}–${hi.toLocaleString("en-IN")} sq ft` : lo ? `From ${lo.toLocaleString("en-IN")} sq ft` : `Up to ${hi.toLocaleString("en-IN")} sq ft`);
      }else if(f.key === "home_loan"){
        if(data.home_loan === true) parts.push("Home loan needed");
      }else if(f.key === "notes" || f.key === "localities"){
        if(data[f.key]) parts.push(f.key === "localities" ? `📍 ${data[f.key]}` : `“${data[f.key]}”`);
      }else{
        const v = data[f.key];
        if(Array.isArray(v) && v.length) parts.push(v.map(x => optionLabel(f, x)).join(", "));
        else if(v && !Array.isArray(v)) parts.push(optionLabel(f, v));
      }
    });
    return parts;
  }

  /* ---------- form ---------- */
  function rangeOptions(section, data, which){
    const steps = isRent(section, data) ? RENT_STEPS : SALE_STEPS;
    const fmt = n => money(section, data, n);
    return `<option value="">${which === "min" ? "No min" : "No max"}</option>` +
      steps.map(n => `<option value="${n}">${fmt(n)}</option>`).join("");
  }

  function fieldHtml(section, f, data){
    const v = data[f.key];
    const name = `${section}-${f.key}`;
    if(f.kind === "one" || f.kind === "many"){
      const chosen = f.key === "home_loan" ? (v === true ? ["yes"] : v === false ? ["no"] : [])
        : Array.isArray(v) ? v : v ? [v] : [];
      return `<fieldset class="req-field" data-field="${f.key}" data-kind="${f.kind}">
        <legend>${esc(f.label)}</legend>
        <div class="req-chips">${f.options.map(([val, label]) =>
          `<button type="button" class="req-chip" data-value="${esc(val)}" aria-pressed="${chosen.includes(val)}">${esc(label)}</button>`).join("")}</div>
      </fieldset>`;
    }
    if(f.kind === "range"){
      return `<div class="req-field" data-field="budget">
        <span class="req-label">${esc(f.label)} <small data-budget-note>${isRent(section, data) ? "(monthly rent)" : ""}</small></span>
        <div class="req-pair">
          <select name="budget_min" aria-label="Minimum budget" data-native>${rangeOptions(section, data, "min")}</select>
          <span>to</span>
          <select name="budget_max" aria-label="Maximum budget" data-native>${rangeOptions(section, data, "max")}</select>
        </div>
      </div>`;
    }
    if(f.kind === "area"){
      return `<div class="req-field" data-field="area">
        <span class="req-label">${esc(f.label)}</span>
        <div class="req-pair">
          <input name="area_min" type="number" inputmode="numeric" min="0" step="50" placeholder="Min" value="${esc(data.area_min || "")}">
          <span>to</span>
          <input name="area_max" type="number" inputmode="numeric" min="0" step="50" placeholder="Max" value="${esc(data.area_max || "")}">
        </div>
      </div>`;
    }
    if(f.kind === "select"){
      return `<label class="req-field"><span class="req-label">${esc(f.label)}</span>
        <select name="${f.key}" data-native><option value="">Select</option>${f.options.map(([val, label]) =>
          `<option value="${val}"${v === val ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`;
    }
    if(f.kind === "textarea"){
      return `<label class="req-field"><span class="req-label">${esc(f.label)}</span>
        <textarea name="${f.key}" maxlength="500" rows="2" placeholder="${esc(f.placeholder || "")}">${esc(v || "")}</textarea></label>`;
    }
    return `<label class="req-field"><span class="req-label">${esc(f.label)}</span>
      <input name="${f.key}" type="text" maxlength="150" placeholder="${esc(f.placeholder || "")}" value="${esc(v || "")}"></label>`;
  }

  function readForm(section, form){
    const out = {};
    SECTIONS[section].fields.forEach(f => {
      if(f.kind === "one" || f.kind === "many"){
        const on = [...form.querySelectorAll(`[data-field="${f.key}"] .req-chip[aria-pressed="true"]`)].map(b => b.dataset.value);
        if(f.key === "home_loan"){ if(on.length) out.home_loan = on[0] === "yes"; }
        else if(f.kind === "many"){ if(on.length) out[f.key] = on; }
        else if(on.length) out[f.key] = on[0];
      }else if(f.kind === "range"){
        const lo = Number(form.budget_min.value) || 0, hi = Number(form.budget_max.value) || 0;
        if(lo) out.budget_min = lo;
        if(hi) out.budget_max = hi;
      }else if(f.kind === "area"){
        const lo = Math.round(Number(form.area_min.value) || 0), hi = Math.round(Number(form.area_max.value) || 0);
        if(lo > 0) out.area_min = lo;
        if(hi > 0) out.area_max = hi;
      }else{
        const v = String(form[f.key].value || "").trim().replace(/\s+/g, " ");
        if(v) out[f.key] = v;
      }
    });
    return Object.keys(out).length ? out : null;
  }

  /* ---------- state ---------- */
  let tab = "residential";
  let editing = null;                        // section being edited

  const reqOf = section => {
    const p = account.profile() || {};
    const v = section === "residential" ? p.req_residential : p.req_commercial;
    return v && typeof v === "object" ? v : null;
  };

  function renderBody(){
    ["residential", "commercial"].forEach(s => {
      const b = document.querySelector(`[data-req-tab="${s}"]`);
      b.setAttribute("aria-selected", String(s === tab));
      b.classList.toggle("filled", !!reqOf(s));
    });
    body.setAttribute("aria-labelledby", tab === "residential" ? "reqTabResidential" : "reqTabCommercial");
    const data = reqOf(tab);

    if(editing === tab){
      /* Already open: keep what the visitor has typed (other changes on
         the page, like a heart, re-render everything else). */
      if(body.querySelector(`form[data-for="${tab}"]`)) return;
      const d = data || {};
      body.innerHTML = `<form class="req-form" data-for="${tab}" novalidate>
        ${SECTIONS[tab].fields.map(f => fieldHtml(tab, f, d)).join("")}
        <p class="req-msg" role="status"></p>
        <div class="profile-form-actions">
          <button type="submit" class="btn-primary">Save requirement</button>
          <button type="button" class="profile-cancel" data-req-cancel>Cancel</button>
        </div>
        ${data ? `<button type="button" class="req-clear" data-req-clear>Remove this requirement</button>` : ""}
      </form>`;
      const form = body.querySelector("form");
      if(d.budget_min) form.budget_min.value = String(d.budget_min);
      if(d.budget_max) form.budget_max.value = String(d.budget_max);
      return;
    }

    if(!data){
      body.innerHTML = `<div class="req-empty">
        <p>${tab === "residential" ? "Looking for a home? Tell us the city, size and budget." : "Looking for an office, shop or showroom? Tell us what you need."}</p>
        <button type="button" class="btn-primary" data-req-edit>Add ${SECTIONS[tab].title} requirement</button>
      </div>`;
      return;
    }
    body.innerHTML = `<div class="req-summary">
      <ul class="req-tags">${summary(tab, data).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <button type="button" class="profile-edit" data-req-edit>Edit</button>
    </div>`;
  }

  /* ---------- recommendations ---------- */
  const STATUS_READY = ["ready_to_move", "resale"];
  const STATUS_LATER = ["under_construction", "new_launch", "upcoming"];

  function scoreCard(card, section, req){
    const d = card.dataset;
    const commercialCard = d.type === "commercial";
    if(commercialCard !== (section === "commercial")) return null;
    if(req.cities && req.cities.length && !req.cities.some(c => slug(c) === d.city)) return null;

    const deal = String(d.deal || "sale");
    if(req.deal === "buy" && !/sale/.test(deal)) return null;
    if((req.deal === "rent" || req.deal === "lease") && !/lease|rent/.test(deal)) return null;

    let score = 1;
    const price = Number(d.price) || 0;
    if(price && req.budget_max){
      if(price > req.budget_max * 1.1) return null;
      score += 2;
    }
    if(price && req.budget_min && price < req.budget_min * 0.7) score -= 1;

    if(section === "residential" && req.bhk && req.bhk.length){
      const list = (d.bhks || "").split("|").filter(Boolean);
      const hit = req.bhk.some(b => b === "5+ BHK" ? list.some(x => parseFloat(x) >= 5) : list.includes(b.toLowerCase()));
      if(hit) score += 3;
      else if(list.length) score -= 2;
    }
    if(req.possession === "ready" && STATUS_READY.includes(d.status)) score += 2;
    if(req.possession === "under_construction" && STATUS_LATER.includes(d.status)) score += 2;
    if(req.localities && d.locality){
      const wanted = req.localities.split(/[,/]| and /i).map(slug).filter(Boolean);
      if(wanted.some(w => w === d.locality || d.locality.includes(w) || w.includes(d.locality))) score += 3;
    }
    return score;
  }

  function seeAllHref(section, req){
    const city = req.cities && req.cities.length === 1 ? slug(req.cities[0]) : "";
    if(section === "commercial") return city ? `commercial/${city}/` : "commercial/";
    const q = new URLSearchParams();
    if(req.cities && req.cities.length === 1) q.set("city", req.cities[0]);
    if(req.bhk && req.bhk.length === 1 && req.bhk[0] !== "5+ BHK") q.set("bhk", req.bhk[0]);
    if(req.budget_max && req.deal !== "rent") q.set("maxPrice", String(req.budget_max));
    if(req.deal === "rent") q.set("status", "rent");
    const s = q.toString();
    return "projects/search" + (s ? "?" + s : "");
  }

  /* The visitor's recently viewed projects (this browser), newest first. */
  const cardById = new Map(cards.map(c => [c.dataset.id, c]));
  function recentIds(){
    try{
      const v = JSON.parse(localStorage.getItem("keys99_recently_viewed") || "[]");
      return (Array.isArray(v) ? v : []).filter(id => cardById.has(id)).slice(0, 12);
    }catch(_){ return []; }
  }

  const RECO_TABS = [["residential", "recoResidential", "recoTabResidential"], ["commercial", "recoCommercial", "recoTabCommercial"], ["recent", "recoRecent", "recoTabRecent"]];
  let recoTab = "";

  function showRecoTab(name){
    recoTab = name;
    RECO_TABS.forEach(([key, panelId, tabId]) => {
      const on = key === name;
      $(panelId).hidden = !on || $(tabId).hidden;
      $(tabId).setAttribute("aria-selected", String(on));
      $(tabId).tabIndex = on ? 0 : -1;
    });
    window.dispatchEvent(new Event("resize"));             /* size BHK rows of cards that were hidden */
  }

  function renderReco(){
    cards.forEach(c => pool.appendChild(c));
    const found = {};
    ["residential", "commercial"].forEach(section => {
      const panel = $(section === "residential" ? "recoResidential" : "recoCommercial");
      const req = reqOf(section);
      const list = panel.querySelector(".reco-scroll");
      let picks = [];
      if(req){
        picks = cards
          .map(card => ({ card, score: scoreCard(card, section, req) }))
          .filter(x => x.score !== null)
          .sort((a, b) => b.score - a.score || String(b.card.dataset.created).localeCompare(String(a.card.dataset.created)))
          .slice(0, 10);
        picks.forEach(x => list.appendChild(x.card));
        panel.querySelector(".reco-all").href = seeAllHref(section, req);
      }
      panel.querySelector(".reco-empty").hidden = !req || picks.length > 0;
      panel.querySelector(".reco-scroller").hidden = !req || !picks.length;
      found[section] = { shown: !!req, count: picks.length };
    });
    const recent = recentIds();
    const recentPanel = $("recoRecent");
    /* A card can only sit in one place, and recently viewed projects are
       often recommended too, so this tab shows copies (opened by the
       delegated click below; hearts and compare are delegated already). */
    const recentList = recentPanel.querySelector(".reco-scroll");
    recentList.innerHTML = "";
    recent.forEach(id => {
      const copy = cardById.get(id).cloneNode(true);
      copy.dataset.copy = "1";
      recentList.appendChild(copy);
    });
    if(recent.length && account.paint) account.paint(recentList);
    recentPanel.querySelector(".reco-empty").hidden = true;
    recentPanel.querySelector(".reco-scroller").hidden = !recent.length;
    found.recent = { shown: recent.length > 0, count: recent.length };

    RECO_TABS.forEach(([key, , tabId]) => {
      const t = $(tabId);
      t.hidden = !found[key].shown;
      t.querySelector(".reco-count").textContent = found[key].shown ? `(${found[key].count})` : "";
    });
    const any = RECO_TABS.some(([key]) => found[key].shown);
    $("recoSection").hidden = !any;
    if(any){
      /* Keep the chosen tab if it still has something; else the first tab with cards. */
      const keep = RECO_TABS.find(([key]) => key === recoTab && found[key].shown);
      const first = RECO_TABS.find(([key]) => found[key].shown && found[key].count) || RECO_TABS.find(([key]) => found[key].shown);
      showRecoTab((keep || first)[0]);
    }
  }

  /* Tabs (arrow keys move between them) and the scroller arrows. */
  $("recoSection").addEventListener("click", e => {
    const copy = e.target.closest(".property-card[data-copy]");
    if(copy && !e.target.closest("a, button, .bhk-scroll") && copy.dataset.url){ window.location.href = copy.dataset.url; return; }
    const t = e.target.closest("[data-reco-tab]");
    if(t){ showRecoTab(t.dataset.recoTab); return; }
    const arrow = e.target.closest("[data-reco-prev], [data-reco-next]");
    if(arrow){
      const scroller = arrow.closest(".reco-scroller").querySelector(".reco-scroll");
      scroller.scrollBy({ left: (arrow.hasAttribute("data-reco-next") ? 1 : -1) * Math.max(240, scroller.clientWidth * 0.8), behavior: "smooth" });
    }
  });
  $("recoSection").addEventListener("keydown", e => {
    if(e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = RECO_TABS.map(([, , id]) => $(id)).filter(t => !t.hidden);
    const at = tabs.indexOf(document.activeElement);
    if(at < 0) return;
    const next = tabs[(at + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    showRecoTab(next.dataset.recoTab);
    e.preventDefault();
  });
  window.addEventListener("storage", e => { if(e.key === "keys99_recently_viewed") renderReco(); });

  function render(){
    const user = account.isReady() && account.user();
    $("reqPrompt").hidden = !user || !!(reqOf("residential") || reqOf("commercial")) || !!editing;
    if(!user){ editing = null; $("recoSection").hidden = true; return; }
    renderBody();
    renderReco();
  }

  /* ---------- events ---------- */
  function openEditor(section){
    tab = section;
    editing = section;
    body.innerHTML = "";
    render();
    $("reqCard").scrollIntoView({ behavior: "smooth", block: "start" });
    const first = body.querySelector(".req-chip, input, select");
    if(first) first.focus({ preventScroll: true });
  }

  document.addEventListener("click", e => {
    const open = e.target.closest("[data-req-open]");
    if(open){ openEditor(open.dataset.reqOpen); return; }
    const t = e.target.closest("[data-req-tab]");
    if(t){
      if(editing && editing !== t.dataset.reqTab) editing = null;
      tab = t.dataset.reqTab;
      render();
      return;
    }
    if(!body.contains(e.target)) return;
    if(e.target.closest("[data-req-edit]")){ openEditor(tab); return; }
    if(e.target.closest("[data-req-cancel]")){ editing = null; render(); return; }
    const chip = e.target.closest(".req-chip");
    if(chip){
      const field = chip.closest("[data-kind]");
      const on = chip.getAttribute("aria-pressed") !== "true";
      if(field.dataset.kind === "one") field.querySelectorAll(".req-chip").forEach(c => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", String(on));
      /* Buy and rent have different budget ranges. */
      if(field.dataset.field === "deal"){
        const form = body.querySelector("form");
        const deal = on ? chip.dataset.value : "";
        const fake = { deal };
        form.budget_min.innerHTML = rangeOptions(tab, fake, "min");
        form.budget_max.innerHTML = rangeOptions(tab, fake, "max");
        const note = form.querySelector("[data-budget-note]");
        if(note) note.textContent = isRent(tab, fake) ? "(monthly rent)" : "";
      }
      return;
    }
    if(e.target.closest("[data-req-clear]")){
      save(null);
    }
  });

  body.addEventListener("submit", e => {
    e.preventDefault();
    const form = e.target;
    const data = readForm(tab, form);
    if(data && data.budget_min && data.budget_max && data.budget_min > data.budget_max){
      form.querySelector(".req-msg").textContent = "The minimum budget is more than the maximum.";
      return;
    }
    if(data && data.area_min && data.area_max && data.area_min > data.area_max){
      form.querySelector(".req-msg").textContent = "The minimum area is more than the maximum.";
      return;
    }
    save(data);
  });

  async function save(data){
    const form = body.querySelector("form");
    const msg = form && form.querySelector(".req-msg");
    const btn = form && form.querySelector("button[type=submit]");
    if(btn) btn.disabled = true;
    if(msg){ msg.classList.add("ok"); msg.textContent = "Saving…"; }
    try{
      await account.updateRequirements({ [tab]: data });
      editing = null;
      render();
      account.toast(data ? "Requirement saved - see your matches below" : "Requirement removed");
      if(data) $("recoSection").scrollIntoView({ behavior: "smooth", block: "start" });
    }catch(ex){
      if(btn) btn.disabled = false;
      if(msg){
        msg.classList.remove("ok");
        msg.textContent = /req_|column/i.test(ex.message || "")
          ? "Requirements can't be saved yet. Please try again later."
          : "Could not save. Please try again.";
      }
    }
  }

  document.addEventListener("keys99:saved", render);
  render();
})();

/* =========================================================
   KEYS99 - MY ENQUIRIES & SITE VISITS (enquiries.html)
   Lists the logged-in visitor's enquiries and site-visit requests
   (Keys99Account.myEnquiries()), newest first, with tabs for All /
   Enquired / Site visits. Project names and links come from the
   hidden #enqPool cards. #visits in the address opens that tab.
========================================================= */

(function(){
  const list = document.getElementById("enqList");
  const pool = document.getElementById("enqPool");
  if(!list || !pool) return;

  const $ = id => document.getElementById(id);
  const account = window.Keys99Account;
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayText = v => { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ""; };
  const timeText = v => { const m = String(v || "").match(/^(\d{1,2}):(\d{2})/); if(!m) return ""; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`; };

  const cards = new Map();
  pool.querySelectorAll(".property-card").forEach(c => cards.set(c.dataset.id, c));

  const bar = $("enqBar");
  bar.querySelector("button").addEventListener("click", () => account && account.logout());
  $("enqLoginBtn").addEventListener("click", () => account && account.openLogin());

  const SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const slotText = k => { const h = +k.slice(0, 2); return `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ahead = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const EDITABLE = ["new", "follow_up", "site_visit_scheduled", ""];
  let editing = null;
  let rows = [], loadedFor = "", tab = location.hash === "#visits" ? "visit" : "all";
  const isVisit = e => e.type === "schedule_site_visit";

  function render(){
    const ready = account && account.isReady();
    const user = account && account.user();
    $("enqLogin").hidden = !(ready && !user);
    bar.hidden = !user;
    if(user) bar.querySelector("span").textContent = `Logged in as ${user.email || "your account"}`;
    $("enqSummary").hidden = !user;
    if(!user){ list.innerHTML = ""; $("enqEmpty").hidden = true; return; }

    const visits = rows.filter(isVisit), enq = rows.filter(e => !isVisit(e));
    $("enqCountAll").textContent = rows.length;
    $("enqCountEnq").textContent = new Set(rows.map(e => e.project_id)).size;
    $("enqCountVisit").textContent = visits.length;
    /* Change date / time of an upcoming site visit: the same popup as
     "Schedule a Site Visit" on a project page. */
  const gate = $("contactGate"), gateForm = $("contactGateForm"), gateDone = $("gateDone"), gateError = $("gateError");
  let returnFocus = null;
  const projectName = row => {
    const card = cards.get(row.project_id);
    return ((card && (card.querySelector(".card-link") || {}).textContent) || "").trim() || "the project";
  };
  const longDate = v => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }); };

  function openGate(row){
    editing = row;
    returnFocus = document.activeElement;
    $("contactGateNote").textContent = `Pick a new day and time for your visit to ${projectName(row)}. The project expert will call to confirm.`;
    $("gateDate").min = ahead(1);
    $("gateDate").max = ahead(60);
    $("gateDate").value = row.visit_date >= ahead(1) ? row.visit_date : ahead(1);
    const current = String(row.visit_time || "").slice(0, 5);
    document.querySelectorAll('input[name="gateSlot"]').forEach(r => { r.checked = r.value === current; });
    gateError.hidden = true;
    $("gateSubmit").disabled = false;
    $("gateSubmit").textContent = "Update Site Visit";
    gateForm.hidden = false;
    gateDone.hidden = true;
    gate.classList.remove("hidden");
    gate.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => $("gateDate").focus(), 50);
  }

  function closeGate(){
    gate.classList.add("hidden");
    gate.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    editing = null;
    if(returnFocus && returnFocus.focus) returnFocus.focus();
  }

  list.addEventListener("click", ev => {
    const btn = ev.target.closest("[data-edit]");
    if(btn) openGate(rows[+btn.dataset.edit]);
  });
  document.querySelectorAll("[data-close-gate]").forEach(el => el.addEventListener("click", closeGate));
  document.addEventListener("keydown", ev => { if(ev.key === "Escape" && editing) closeGate(); });
  $("gateSlots").addEventListener("change", () => { gateError.hidden = true; });
  $("gateDate").addEventListener("change", () => { gateError.hidden = true; });

  gateForm.addEventListener("submit", async ev => {
    ev.preventDefault();
    const fail = text => { gateError.textContent = text; gateError.hidden = false; };
    const date = $("gateDate").value;
    const slot = document.querySelector('input[name="gateSlot"]:checked');
    if(!date || date < ahead(1) || date > ahead(60)) return fail("Please pick a date between tomorrow and the next 60 days.");
    if(!slot) return fail("Please pick a time slot.");
    const row = editing, button = $("gateSubmit");
    button.disabled = true;
    button.textContent = "Saving...";
    try{
      await account.rescheduleVisit(row, date, slot.value);
    }catch(err){
      button.disabled = false;
      button.textContent = "Update Site Visit";
      return fail((err && err.message) || "Could not update the visit. Please try again.");
    }
    row.visit_date = date;
    row.visit_time = slot.value;
    $("gateDoneText").textContent = `Your visit to ${projectName(row)} is now ${longDate(date)} at ${slotText(slot.value)}. The project expert will call to confirm.`;
    gateForm.hidden = true;
    gateDone.hidden = false;
    render();
    setTimeout(() => gateDone.querySelector(".contact-gate-secondary").focus(), 50);
  });

  document.querySelectorAll("[data-enq-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.enqTab === tab)));

    const shown = tab === "visit" ? visits : tab === "enquiry" ? enq : rows;
    list.innerHTML = shown.map(e => {
      const card = cards.get(e.project_id);
      const name = card ? ((card.querySelector(".card-link") || {}).textContent || "").trim() : "";
      const where = card ? ((card.querySelector(".location") || {}).textContent || "").replace(/^[^A-Za-z0-9]+/, "").trim() : "";
      const img = card ? card.querySelector("img") : null;
      const url = card ? card.dataset.url : "";
      const visit = isVisit(e);
      const what = visit
        ? `Site visit · ${[dayText(e.visit_date), timeText(e.visit_time)].filter(Boolean).join(", ") || "requested"}`
        : `Enquiry sent · ${dayText(e.at)}`;
      const title = esc(name || "Project");
      const thumb = img ? `<img src="${esc(img.getAttribute("src") || "")}" alt="" loading="lazy">` : `<span class="enq-thumb-ph">🏢</span>`;
      const head = url ? `<a href="${esc(url)}">${title}</a>` : `<strong>${title}</strong>`;

      let action = "";
      const upcoming = visit && e.visit_date && e.visit_date >= ahead(0);
      if(upcoming && e.id){
        if(!EDITABLE.includes(e.status)) action = `<small class="enq-locked">Confirmed by our team. Please contact us to change it.</small>`;
        else action = `<button type="button" class="enq-edit-btn" data-edit="${rows.indexOf(e)}">✎ Change date or time</button>`;
      }
      return `<li class="enq-item" data-i="${rows.indexOf(e)}"><div class="enq-thumb">${thumb}</div><div class="enq-body">${head}${where ? `<small>${esc(where)}</small>` : ""}<span class="enq-tag ${visit ? "visit" : ""}">${visit ? "📅" : "✉"} ${esc(what)}</span>${action}</div></li>`;
    }).join("");

    const empty = shown.length === 0;
    $("enqEmpty").hidden = !(ready && empty);
    $("enqEmptyTitle").textContent = tab === "visit" ? "No site visits scheduled yet." : tab === "enquiry" ? "No enquiries yet." : "No enquiries or site visits yet.";
  }

  async function load(){
    const user = account && account.user();
    if(!user){ rows = []; loadedFor = ""; render(); return; }
    if(loadedFor !== user.id){
      loadedFor = user.id;
      try{ rows = await account.myEnquiries(); }catch(_){ rows = []; }
    }
    render();
  }

  document.querySelectorAll("[data-enq-tab]").forEach(b => b.addEventListener("click", () => {
    tab = b.dataset.enqTab;
    render();
  }));
  window.addEventListener("hashchange", () => { tab = location.hash === "#visits" ? "visit" : "all"; render(); });
  window.addEventListener("pageshow", () => { loadedFor = ""; load(); });
  document.addEventListener("keys99:saved", load);
  load();
})();

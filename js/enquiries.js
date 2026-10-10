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
      return `<li class="enq-item"><div class="enq-thumb">${thumb}</div><div class="enq-body">${head}${where ? `<small>${esc(where)}</small>` : ""}<span class="enq-tag ${visit ? "visit" : ""}">${visit ? "📅" : "✉"} ${esc(what)}</span></div></li>`;
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

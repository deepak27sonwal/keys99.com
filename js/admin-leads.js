/* =========================================================
   KEYS99 - LEADS PAGE (admin/leads.html)

   Staff sign in with their Supabase account. Row-level security
   decides what they see: admins every enquiry, agents the ones
   assigned to them. Leads can be filtered, called or messaged on
   WhatsApp, given a status and a private note.
========================================================= */

(function(){
  const $ = id => document.getElementById(id);
  const LIMIT = 500;

  const TYPES = {
    enquire_now: "Enquiry",
    whatsapp_now: "WhatsApp",
    request_callback: "Call",
    schedule_site_visit: "Site visit",
    get_price_details: "Price details"
  };
  const STATUSES = {
    new: "New",
    contacted: "Contacted",
    follow_up: "Follow-up",
    site_visit_scheduled: "Visit scheduled",
    converted: "Converted",
    closed: "Closed",
    spam: "Spam"
  };
  const CLOSED = ["converted", "closed", "spam"];

  let leads = [];
  let filters = { type: "", status: "", project: "", search: "", upcoming: false, today: false };

  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  let toastTimer;
  function toast(text){
    const el = $("admToast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ---------- dates ---------- */

  const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => localDay(new Date());

  function ago(iso){
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if(mins < 1) return "just now";
    if(mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if(hrs < 24) return `${hrs} h ago`;
    const days = Math.round(hrs / 24);
    if(days < 7) return `${days} d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function visitText(date, time){
    if(!date) return "";
    const [y, m, d] = date.split("-").map(Number);
    let text = new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    if(time){
      const [h, min] = time.split(":").map(Number);
      text += ` · ${((h + 11) % 12) + 1}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    }
    return text;
  }

  /* ---------- lead details ---------- */

  const configurationOf = lead => {
    const m = /(?:Configuration|Preferred BHK):\s*(.+)/i.exec(lead.message || "");
    return m ? m[1].trim() : "";
  };

  function sourceOf(lead){
    if(lead.utm_source) return [lead.utm_source, lead.utm_campaign].filter(Boolean).join(" / ");
    if(lead.referrer) return lead.referrer.replace(/^www\./, "").replace(/\/$/, "");
    return lead.landing_page ? "Direct" : "";
  }

  const digits = v => String(v || "").replace(/\D/g, "");
  /* Indian 10-digit numbers get the 91 country code for wa.me. */
  const waNumber = v => { const d = digits(v); return d.length === 10 ? "91" + d : d; };

  /* ---------- auth ---------- */

  async function showSignedIn(session){
    $("admSignIn").hidden = true;
    $("admLeads").hidden = false;
    $("admUser").hidden = false;
    $("admEmail").textContent = session.user.email || "";
    await load();
  }

  function showSignIn(){
    $("admLeads").hidden = true;
    $("admUser").hidden = true;
    $("admSignIn").hidden = false;
    setTimeout(() => $("admEmailInput").focus(), 50);
  }

  $("admSignInForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("admSignInBtn");
    btn.disabled = true;
    btn.textContent = "Signing in...";
    $("admSignInError").hidden = true;
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: $("admEmailInput").value.trim(),
      password: $("admPassword").value
    });
    btn.disabled = false;
    btn.textContent = "Sign in";
    if(error){
      $("admSignInError").textContent = /invalid/i.test(error.message) ? "Wrong email or password." : error.message;
      $("admSignInError").hidden = false;
      return;
    }
    $("admPassword").value = "";
    showSignedIn(data.session);
  });

  $("admSignOut").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    leads = [];
    $("admList").innerHTML = "";
    showSignIn();
  });

  /* ---------- load ---------- */

  async function load(){
    $("admCount").textContent = "Loading leads...";
    const { data, error } = await supabaseClient
      .from("residential_enquiries")
      .select("*, project:residential_projects!residential_enquiries_project_id_fkey(project_name, slug)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if(error){
      console.error("Leads failed:", error);
      $("admCount").textContent = "";
      $("admEmpty").textContent = "Could not load leads: " + error.message;
      $("admEmpty").hidden = false;
      return;
    }
    leads = data || [];
    fillProjectFilter();
    render();
  }

  function fillProjectFilter(){
    const select = $("fProject");
    const current = select.value;
    const projects = [...new Map(leads.filter(l => l.project).map(l => [l.project_id, l.project.project_name])).entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    select.innerHTML = `<option value="">All projects</option>` +
      projects.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
    select.value = projects.some(([id]) => id === current) ? current : "";
  }

  /* ---------- filter + render ---------- */

  function isUpcomingVisit(l){
    return l.enquiry_type === "schedule_site_visit" && l.preferred_visit_date && l.preferred_visit_date >= today()
      && !CLOSED.includes(l.status);
  }

  function visible(){
    const q = filters.search.toLowerCase();
    const qDigits = digits(filters.search);
    let list = leads.filter(l =>
      (!filters.type || l.enquiry_type === filters.type) &&
      (!filters.status || l.status === filters.status) &&
      (!filters.project || l.project_id === filters.project) &&
      (!filters.upcoming || isUpcomingVisit(l)) &&
      (!filters.today || localDay(new Date(l.created_at)) === today()) &&
      (!q || String(l.contact_person || "").toLowerCase().includes(q) || (qDigits.length >= 3 && digits(l.phone).includes(qDigits)))
    );
    if(filters.upcoming){
      list = list.slice().sort((a, b) =>
        (a.preferred_visit_date + (a.preferred_visit_time || "")).localeCompare(b.preferred_visit_date + (b.preferred_visit_time || "")));
    }
    return list;
  }

  function render(){
    $("statNew").textContent = leads.filter(l => l.status === "new").length;
    $("statToday").textContent = leads.filter(l => localDay(new Date(l.created_at)) === today()).length;
    $("statVisits").textContent = leads.filter(isUpcomingVisit).length;
    $("statAll").textContent = leads.length;

    const list = visible();
    $("admCount").textContent = `${list.length} of ${leads.length} lead${leads.length === 1 ? "" : "s"}` +
      (leads.length >= LIMIT ? ` (newest ${LIMIT})` : "");
    $("admEmpty").hidden = list.length > 0;
    $("admEmpty").textContent = leads.length
      ? "No leads match these filters."
      : "No leads yet - or this account has no access to any. Admins see every lead; agents see leads assigned to them.";

    $("admList").innerHTML = list.map(l => {
      const project = l.project ? l.project.project_name : "Unknown project";
      const projectUrl = l.project ? `../projects/${encodeURIComponent(l.project.slug)}/` : "";
      const config = configurationOf(l);
      const source = sourceOf(l);
      const visit = visitText(l.preferred_visit_date, l.preferred_visit_time);
      const wa = waNumber(l.whatsapp || l.phone);
      const waText = `Hi ${l.contact_person || ""}, this is Keys99 about ${project}.`;
      return `
      <article class="adm-lead status-${esc(l.status)}" data-id="${esc(l.id)}">
        <div class="adm-lead-head">
          <div>
            <strong class="adm-name">${esc(l.contact_person || "—")}</strong>
            <span class="adm-type type-${esc(l.enquiry_type)}">${esc(TYPES[l.enquiry_type] || l.enquiry_type)}</span>
          </div>
          <time datetime="${esc(l.created_at)}" title="${esc(new Date(l.created_at).toLocaleString("en-IN"))}">${esc(ago(l.created_at))}</time>
        </div>
        <div class="adm-lead-body">
          <p class="adm-project">${projectUrl ? `<a href="${esc(projectUrl)}" target="_blank" rel="noopener">${esc(project)}</a>` : esc(project)}${config ? ` · <b>${esc(config)}</b>` : ""}</p>
          ${visit ? `<p class="adm-visit${isUpcomingVisit(l) ? " is-upcoming" : ""}">📅 ${esc(visit)}</p>` : ""}
          ${l.message ? `<p class="adm-message">${esc(l.message)}</p>` : ""}
          <p class="adm-meta">
            ${esc(l.phone || "")}${l.email ? ` · ${esc(l.email)}` : ""}
            ${source ? ` · Source: ${esc(source)}` : ""}
            ${l.page_url ? ` · From: ${esc(l.page_url.replace(/^.*?\/projects\//, "/projects/"))}` : ""}
          </p>
        </div>
        <div class="adm-lead-actions">
          ${l.phone ? `<a class="adm-btn call" href="tel:${esc(digits(l.phone).length === 10 ? "+91" + digits(l.phone) : l.phone)}">Call</a>` : ""}
          ${wa ? `<a class="adm-btn wa" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          <select class="adm-status" aria-label="Status">
            ${Object.entries(STATUSES).map(([v, label]) => `<option value="${v}"${v === l.status ? " selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
        <textarea class="adm-notes" rows="2" placeholder="Private note (saved when you click away)">${esc(l.admin_notes || "")}</textarea>
      </article>`;
    }).join("");
  }

  /* ---------- updates ---------- */

  async function update(id, changes){
    const { error } = await supabaseClient.from("residential_enquiries").update(changes).eq("id", id);
    if(error){
      console.error("Update failed:", error);
      toast("Could not save: " + error.message);
      return false;
    }
    const lead = leads.find(l => l.id === id);
    if(lead) Object.assign(lead, changes);
    return true;
  }

  $("admList").addEventListener("change", async e => {
    if(!e.target.classList.contains("adm-status")) return;
    const card = e.target.closest(".adm-lead");
    const lead = leads.find(l => l.id === card.dataset.id);
    const status = e.target.value;
    const changes = { status };
    if(status !== "new" && !lead.contacted_at) changes.contacted_at = new Date().toISOString();
    if(CLOSED.includes(status) && !lead.closed_at) changes.closed_at = new Date().toISOString();
    if(!CLOSED.includes(status) && lead.closed_at) changes.closed_at = null;
    if(await update(lead.id, changes)){
      toast(`Marked ${STATUSES[status]}`);
      render();
    }else{
      e.target.value = lead.status;
    }
  });

  $("admList").addEventListener("focusout", async e => {
    if(!e.target.classList.contains("adm-notes")) return;
    const card = e.target.closest(".adm-lead");
    const lead = leads.find(l => l.id === card.dataset.id);
    const note = e.target.value.trim();
    if(note === (lead.admin_notes || "").trim()) return;
    if(await update(lead.id, { admin_notes: note || null })) toast("Note saved");
  });

  /* ---------- filter controls ---------- */

  $("fStatus").innerHTML = `<option value="">All statuses</option>` +
    Object.entries(STATUSES).map(([v, label]) => `<option value="${v}">${label}</option>`).join("");

  function setType(type){
    filters.type = type;
    document.querySelectorAll("#typeChips .adm-chip").forEach(c => c.classList.toggle("is-on", c.dataset.type === type));
  }

  $("typeChips").addEventListener("click", e => {
    const chip = e.target.closest(".adm-chip");
    if(!chip) return;
    setType(chip.dataset.type);
    filters.today = false;
    render();
  });
  /* "Today" (from the summary box) lasts until another filter is used. */
  $("fSearch").addEventListener("input", () => { filters.search = $("fSearch").value.trim(); filters.today = false; render(); });
  $("fStatus").addEventListener("change", () => { filters.status = $("fStatus").value; filters.today = false; render(); });
  $("fProject").addEventListener("change", () => { filters.project = $("fProject").value; filters.today = false; render(); });
  $("fUpcoming").addEventListener("change", () => { filters.upcoming = $("fUpcoming").checked; filters.today = false; render(); });
  $("admRefresh").addEventListener("click", load);

  /* The summary boxes are shortcuts to their filtered lists. */
  document.querySelector(".adm-stats").addEventListener("click", e => {
    const box = e.target.closest("[data-quick]");
    if(!box) return;
    const q = box.dataset.quick;
    filters = { type: "", status: q === "new" ? "new" : "", project: "", search: "", upcoming: q === "visits", today: q === "today" };
    setType("");
    $("fStatus").value = filters.status;
    $("fProject").value = "";
    $("fSearch").value = "";
    $("fUpcoming").checked = filters.upcoming;
    render();
  });

  /* New leads keep arriving: refresh every 2 minutes while the tab is open. */
  setInterval(() => { if(!$("admLeads").hidden && document.visibilityState === "visible") load(); }, 120000);

  /* ---------- start ---------- */

  supabaseClient.auth.getSession().then(({ data }) => {
    if(data && data.session) showSignedIn(data.session);
    else showSignIn();
  });
})();

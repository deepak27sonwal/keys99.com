/* =========================================================
   KEYS99 - PROFILE PAGE (profile.html)
   Shows one of three states from js/account.js:
   - loading, while the login is being checked (no flash of the
     logged-out card for someone who is logged in),
   - a "Log in to Keys99" card for visitors,
   - the visitor's photo or initial, name, email, profile settings
     (name, mobile, email), counts (saved, recently viewed, to
     compare), shortcuts and Log out.
   Re-renders on the "keys99:saved" event (login, logout, saves,
   profile changes).
========================================================= */

(function(){
  const $ = id => document.getElementById(id);
  const account = window.Keys99Account;
  if(!$("profileGuest") || !account) return;

  const readList = key => {
    try{
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    }catch(_){ return []; }
  };

  /* "+919876543210" -> "+91 98765 43210" */
  const prettyPhone = p => {
    const d = String(p || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : (p || "");
  };

  function paintAvatar(el, user){
    const meta = user.user_metadata || {};
    const prof = account.profile() || {};
    const photo = prof.avatar_url || meta.avatar_url || meta.picture;
    const initial = account.displayName().charAt(0).toUpperCase();
    el.textContent = "";
    if(photo){
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); el.textContent = initial; };
      el.appendChild(img);
    }else{
      el.textContent = initial;
    }
  }

  let editing = false;

  function render(){
    const ready = account.isReady();
    const user = account.user();
    $("profileLoading").hidden = ready;
    $("profileGuest").hidden = !ready || !!user;
    $("profileUser").hidden = !ready || !user;
    if(!user){
      editing = false;
      return;
    }

    const prof = account.profile() || {};
    paintAvatar($("profileAvatar"), user);
    $("profileName").textContent = account.displayName();
    $("profileEmail").textContent = user.email || "";

    const empty = text => `<span class="profile-empty">${text}</span>`;
    $("pdName").innerHTML = "";
    if(prof.full_name) $("pdName").textContent = prof.full_name; else $("pdName").innerHTML = empty("Add your name");
    $("pdPhone").innerHTML = "";
    if(prof.phone) $("pdPhone").textContent = window.Keys99Phone ? Keys99Phone.pretty(prof.phone) : prettyPhone(prof.phone); else $("pdPhone").innerHTML = empty("Add your number");
    $("pdEmail").textContent = user.email || "";
    if(user.new_email){
      const pending = document.createElement("span");
      pending.className = "profile-pending";
      pending.textContent = `Waiting for confirmation: ${user.new_email}`;
      $("pdEmail").appendChild(pending);
    }

    $("profileDetails").hidden = editing;
    $("profileForm").hidden = !editing;
    $("profileEdit").hidden = editing;

    $("statSaved").textContent = account.ids().length;
    loadEnquiries();
    $("statRecent").textContent = readList("keys99_recently_viewed").length;
    $("statCompare").textContent = window.Keys99Compare ? Keys99Compare.list().length : 0;
  }

  /* ---------- editing ---------- */
  const msg = (text, ok) => {
    $("pfMsg").textContent = text || "";
    $("pfMsg").classList.toggle("ok", !!ok);
  };

  function openForm(){
    const user = account.user();
    const prof = account.profile() || {};
    $("pfName").value = prof.full_name || account.displayName() || "";
    if(window.Keys99Phone) Keys99Phone.set($("pfPhone"), prof.phone || "");
    $("pfEmail").value = user.email || "";
    msg("");
    editing = true;
    render();
    $("pfName").focus();
  }

  function closeForm(){
    editing = false;
    msg("");
    render();
  }

  /* Profile settings and My enquiries sit behind shortcut rows, like
     Saved and Compare. */
  function foldRow(linkId, panelId){
    const link = $(linkId), panel = $(panelId);
    const set = (open, scroll) => {
      panel.hidden = !open;
      link.setAttribute("aria-expanded", String(open));
      link.classList.toggle("open", open);
      if(open && scroll) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    link.addEventListener("click", () => set(panel.hidden, true));
    return set;
  }
  const setSettingsOpen = foldRow("profileSettingsLink", "profileSettingsCard");
  const setEnquiriesOpen = foldRow("profileEnquiriesLink", "profileEnquiriesPanel");
  if(location.hash === "#settings") setSettingsOpen(true, false);
  if(location.hash === "#enquiries") setEnquiriesOpen(true, false);
  document.addEventListener("click", e => {
    if(!e.target.closest("[data-open-enquiries]")) return;
    e.preventDefault();
    setEnquiriesOpen(true, true);
  });

  /* ---------- enquiries and site visits ---------- */
  const projectCards = new Map();
  document.querySelectorAll("#recoPool .property-card").forEach(c => projectCards.set(c.dataset.id, c));
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayText = v => { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : ""; };
  const timeText = v => { const m = String(v || "").match(/^(\d{1,2}):(\d{2})/); if(!m) return ""; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`; };
  let enquiries = [], enquiriesFor = "";

  function paintEnquiries(){
    const visits = enquiries.filter(e => e.type === "schedule_site_visit");
    $("statEnquired").textContent = new Set(enquiries.map(e => e.project_id)).size;
    $("statVisits").textContent = visits.length;
    $("enqList").innerHTML = enquiries.map(e => {
      const card = projectCards.get(e.project_id);
      const name = card ? (card.querySelector(".card-link") || {}).textContent : "";
      const url = card ? card.dataset.url : "";
      const isVisit = e.type === "schedule_site_visit";
      const what = isVisit
        ? `Site visit · ${[dayText(e.visit_date), timeText(e.visit_time)].filter(Boolean).join(", ") || "requested"}`
        : `Enquiry sent · ${dayText(e.at)}`;
      const title = esc((name || "").trim() || "Project");
      return `<li><span class="profile-enq-icon" aria-hidden="true">${isVisit ? "📅" : "✉"}</span><span class="profile-enq-text">${url ? `<a href="${esc(url)}">${title}</a>` : `<strong>${title}</strong>`}<small>${esc(what)}</small></span></li>`;
    }).join("");
    $("enqEmpty").hidden = enquiries.length > 0;
  }

  async function loadEnquiries(){
    const user = account.user();
    if(!user){ enquiries = []; enquiriesFor = ""; return; }
    if(enquiriesFor === user.id) return;
    enquiriesFor = user.id;
    try{ enquiries = await account.myEnquiries(); }catch(_){ enquiries = []; }
    paintEnquiries();
  }

  $("profileEdit").addEventListener("click", openForm);
  $("pfCancel").addEventListener("click", closeForm);

  $("profileForm").addEventListener("submit", async e => {
    e.preventDefault();
    const user = account.user();
    const prof = account.profile() || {};
    const name = $("pfName").value.trim().replace(/\s+/g, " ");
    const phoneRead = window.Keys99Phone ? Keys99Phone.read($("pfPhone")) : { number: "" };
    const email = $("pfEmail").value.trim().toLowerCase();

    if(name && name.length < 2){ msg("Please enter your full name."); $("pfName").focus(); return; }
    if(phoneRead.error){ msg(phoneRead.error); $("pfPhone").focus(); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ msg("Please enter a valid email address."); $("pfEmail").focus(); return; }

    const phone = phoneRead.number;
    const profileChanged = name !== (prof.full_name || "") || phone !== (prof.phone || "");
    const emailChanged = email !== (user.email || "").toLowerCase();
    if(!profileChanged && !emailChanged){ closeForm(); return; }

    $("pfSave").disabled = true;
    msg("Saving…", true);
    try{
      if(profileChanged) await account.updateProfile({ fullName: name, phone });
      if(emailChanged){
        try{
          await account.changeEmail(email);
        }catch(ex){
          $("pfSave").disabled = false;
          msg(/registered|already/i.test(ex.message || "")
            ? "That email is already used by another account."
            : /rate|seconds/i.test(ex.message || "")
              ? "Please wait a minute before changing your email again."
              : "Could not change your email. Please try again.");
          return;
        }
      }
      editing = false;
      render();
      account.toast(emailChanged
        ? `Check ${email} for a link to confirm your new email`
        : "Profile updated");
    }catch(ex){
      msg("Could not save your profile. Please try again.");
    }
    $("pfSave").disabled = false;
  });

  /* ---------- account ---------- */
  $("profileLogin").addEventListener("click", () => account.openLogin());
  $("profileLogout").addEventListener("click", () => account.logout());
  document.addEventListener("keys99:saved", render);
  window.addEventListener("pageshow", () => { enquiriesFor = ""; render(); });

  render();
})();

/* =========================================================
   KEYS99 - VISITOR ACCOUNT AND SAVED PROJECTS
   The ♡ on project cards (.fav) and on project pages (#favoriteBtn)
   saves the project to the visitor's account, in the saved_projects
   table. A visitor who is not logged in gets the login popup first:
   Continue with Google, or a one-time code sent to their email. The
   project they tapped is saved as soon as they are logged in -
   after Google's redirect too (the tap waits in sessionStorage).

   The Supabase library is large, so pages that do not already load
   it get it only when it is needed: when a login is stored in this
   browser, when Google sends the visitor back, or on the first ♡ tap.

   Also keeps the header's Saved count ([data-saved-count]) and gives
   saved.js the list: window.Keys99Account, and a "keys99:saved"
   event on document whenever the list or the login changes.
========================================================= */

(function(){

  const SRC = document.currentScript && document.currentScript.src;
  const JS_BASE = SRC ? SRC.replace(/account\.js(\?.*)?$/, "") : "js/";
  const CACHE_KEY = "keys99_saved";        /* last known list, for an instant paint */
  const PENDING_KEY = "keys99_pending_save";

  let user = null;
  let profile = null;                        /* this account's row in profiles */
  let ready = false;                         /* login state known */
  let saved = new Map();                     /* project id -> kind, newest first */
  let clientPromise = null;

  const store = {
    get(area, key){ try{ return JSON.parse(window[area].getItem(key) || "null"); }catch(_){ return null; } },
    set(area, key, value){ try{ window[area].setItem(key, JSON.stringify(value)); }catch(_){} },
    del(area, key){ try{ window[area].removeItem(key); }catch(_){} }
  };

  /* ---------- the Supabase client, loaded on demand ---------- */
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  function client(){
    if(!clientPromise){
      clientPromise = (async () => {
        if(!window.supabase) await loadScript(JS_BASE + "supabase.js");
        if(typeof supabaseClient === "undefined") await loadScript(JS_BASE + "config.js");
        return supabaseClient;
      })();
      clientPromise.then(watchAuth).catch(() => { clientPromise = null; });
    }
    return clientPromise;
  }

  function storedLogin(){
    try{
      for(let i = 0; i < localStorage.length; i++){
        if(/^sb-.+-auth-token$/.test(localStorage.key(i))) return true;
      }
    }catch(_){}
    return false;
  }

  /* Where Supabase sends the visitor back to after Google or the email
     link: this page, without a previous login's leftovers. It must match
     an entry in Supabase's Authentication > URL Configuration > Redirect
     URLs (e.g. https://keys99.com/**), or Supabase sends the visitor to
     the project's Site URL instead. */
  function returnUrl(){
    const params = new URLSearchParams(location.search);
    ["code", "error", "error_code", "error_description"].forEach(k => params.delete(k));
    const query = params.toString();
    return location.origin + location.pathname + (query ? "?" + query : "");
  }

  function loginInUrl(){
    return /[#&](access_token|error_description)=/.test(location.hash) || /[?&]code=/.test(location.search);
  }

  /* ---------- login state ---------- */
  let loadedFor;                             /* user id the list was loaded for */
  function watchAuth(sb){
    sb.auth.onAuthStateChange((event, session) => {
      user = session ? session.user : null;
      const uid = user ? user.id : null;
      if(uid === loadedFor) return;
      loadedFor = uid;
      /* Supabase runs this inside its own lock; queries wait for it to end. */
      setTimeout(() => loadSaved(sb), 0);
    });
  }

  async function loadSaved(sb){
    if(user){
      const { data, error } = await sb.from("saved_projects")
        .select("project_kind, project_id")
        .order("created_at", { ascending: false });
      if(!error){
        saved = new Map((data || []).map(r => [r.project_id, r.project_kind]));
        store.set("localStorage", CACHE_KEY, { uid: user.id, items: [...saved] });
      }
      await loadProfile(sb);
    }else{
      saved = new Map();
      profile = null;
      store.del("localStorage", CACHE_KEY);
    }
    ready = true;
    changed();
    if(user) runPendingSave();
    /* Google's return leaves an empty "#" once Supabase has read the login from it. */
    if(location.href.endsWith("#")) history.replaceState(null, "", location.pathname + location.search);
  }

  /* ---------- profile (name, phone) ---------- */
  async function loadProfile(sb){
    const { data } = await sb.from("profiles").select("full_name, phone, avatar_url").eq("id", user.id).maybeSingle();
    profile = data || null;
    prefillContact();
  }

  function displayName(){
    if(!user) return "";
    const meta = user.user_metadata || {};
    return (profile && profile.full_name) || meta.full_name || meta.name || (user.email || "").split("@")[0] || "Keys99 member";
  }

  /* The enquiry forms on project pages remember the last name and number
     sent (k99_contact). A logged-in visitor's profile fills them when
     they are still empty. */
  function prefillContact(){
    if(!profile) return;
    const name = profile.full_name || "";
    const phone = (profile.phone || "").replace(/^\+91/, "");
    try{
      if(!localStorage.getItem("k99_contact") && (name || phone)){
        localStorage.setItem("k99_contact", JSON.stringify({ name, phone }));
      }
    }catch(_){}
    const fill = (id, value) => {
      const el = document.getElementById(id);
      if(el && value && !el.value) el.value = value;
    };
    fill("enquiryName", name);
    fill("enquiryPhone", phone);
  }

  async function updateProfile({ fullName, phone }){
    const sb = await client();
    const { data, error } = await sb.from("profiles")
      .update({ full_name: fullName || null, phone: phone || null })
      .eq("id", user.id)
      .select("full_name, phone, avatar_url")
      .maybeSingle();
    if(error) throw error;
    if(!data) throw new Error("Your profile could not be found. Please log out and in again.");
    profile = data;
    /* Keep the login's own copy of the name in step (shown before the profile loads). */
    const { data: updated } = await sb.auth.updateUser({ data: { full_name: fullName || null } });
    if(updated && updated.user) user = updated.user;
    try{ localStorage.setItem("k99_contact", JSON.stringify({ name: fullName || "", phone: (phone || "").replace(/^\+91/, "") })); }catch(_){}
    changed();
  }

  /* Supabase emails a confirmation link to the new address (and to the
     current one too, when "Secure email change" is on); the address
     changes once it is confirmed. */
  async function changeEmail(email){
    const sb = await client();
    const { data, error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname });
    if(error) throw error;
    if(data && data.user) user = data.user;
    changed();
  }

  /* ---------- saving ---------- */
  function kindOf(btn){
    if(btn.dataset.kind) return btn.dataset.kind;
    const card = btn.closest(".property-card");
    const link = card && card.querySelector("a.card-link, a[href]");
    return link && /(^|\/)commercial\//.test(link.getAttribute("href") || "") ? "commercial" : "residential";
  }

  async function setSaved(id, kind, on){
    const sb = await client();
    const before = new Map(saved);
    if(on){
      saved = new Map([[id, kind], ...saved]);
    }else{
      saved.delete(id);
    }
    changed();
    const { error } = on
      ? await sb.from("saved_projects").insert({ user_id: user.id, project_kind: kind, project_id: id })
      : await sb.from("saved_projects").delete().eq("project_id", id).eq("user_id", user.id);
    /* 23505: already saved (from another tab or device). */
    if(error && error.code !== "23505"){
      saved = before;
      changed();
      toast("Could not update your saved projects. Please try again.");
      return;
    }
    store.set("localStorage", CACHE_KEY, { uid: user.id, items: [...saved] });
    toast(on ? "Saved to your account" : "Removed from saved");
  }

  function toggle(id, kind){
    if(!id) return;
    if(user){
      setSaved(id, kind, !saved.has(id));
      return;
    }
    store.set("sessionStorage", PENDING_KEY, { id, kind, at: Date.now() });
    openLogin();
  }

  function runPendingSave(){
    const p = store.get("sessionStorage", PENDING_KEY);
    store.del("sessionStorage", PENDING_KEY);
    if(!p || !p.id || Date.now() - (p.at || 0) > 30 * 60 * 1000) return;
    if(saved.has(p.id)) return;
    setSaved(p.id, p.kind === "commercial" ? "commercial" : "residential", true);
  }

  /* ---------- hearts and the Saved count ---------- */
  function paint(root){
    (root || document).querySelectorAll(".fav[data-property-id], #favoriteBtn[data-property-id]").forEach(btn => {
      const on = saved.has(btn.dataset.propertyId);
      btn.classList.toggle(btn.id === "favoriteBtn" ? "saved" : "active", on);
      btn.textContent = on ? "♥" : "♡";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Remove from saved" : "Save this project");
    });
    document.querySelectorAll("[data-saved-count]").forEach(el => {
      el.textContent = saved.size;
      el.hidden = !saved.size;
    });
  }

  /* The bottom bar's Profile tab shows the visitor's photo or initial
     while they are logged in, and its person icon otherwise. */
  let tabIcon;
  function paintProfileTab(){
    const icon = document.querySelector('#bottomNav [data-target="profile"] .bn-icon');
    if(!icon) return;
    if(tabIcon === undefined) tabIcon = icon.innerHTML;
    if(!user){
      icon.classList.remove("has-avatar");
      if(icon.innerHTML !== tabIcon) icon.innerHTML = tabIcon;
      return;
    }
    const meta = user.user_metadata || {};
    const name = displayName() || "?";
    const photo = (profile && profile.avatar_url) || meta.avatar_url || meta.picture;
    const avatar = document.createElement("span");
    avatar.className = "bn-avatar";
    if(photo){
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); avatar.textContent = name.charAt(0).toUpperCase(); };
      avatar.appendChild(img);
    }else{
      avatar.textContent = name.charAt(0).toUpperCase();
    }
    icon.classList.add("has-avatar");
    icon.replaceChildren(avatar);
  }

  function changed(){
    paint();
    paintProfileTab();
    document.dispatchEvent(new CustomEvent("keys99:saved"));
  }

  /* Capture phase, so the card's own "open the project" click never runs. */
  document.addEventListener("click", e => {
    const btn = e.target.closest && e.target.closest(".fav[data-property-id], #favoriteBtn");
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(btn.dataset.propertyId, kindOf(btn));
  }, true);

  /* Cards the page draws later (the homepage refreshes them from the database). */
  let pendingPaint;
  new MutationObserver(records => {
    if(records.every(r => r.target.closest && r.target.closest(".k99-login, .k99-toast"))) return;
    clearTimeout(pendingPaint);
    pendingPaint = setTimeout(() => paint(), 50);
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(text){
    let el = document.querySelector(".k99-toast");
    if(!el){
      el = document.createElement("div");
      el.className = "k99-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- login popup ---------- */
  const STYLE = `
.k99-login{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(8,45,56,.55)}
.k99-login[hidden]{display:none}
.k99-login-box{position:relative;width:100%;max-width:380px;background:#fff;color:#082d38;border-radius:18px;padding:26px 22px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:inherit}
.k99-login h2{margin:0 0 6px;padding:0 30px;font-size:1.3rem;line-height:1.25}
.k99-login p{margin:0 0 16px;color:#4b5f66;font-size:.95rem;line-height:1.45}
.k99-login-close{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;border-radius:50%;background:#f1f4f5;color:#082d38;font-size:20px;cursor:pointer}
.k99-login button.k99-btn,.k99-login input{width:100%;box-sizing:border-box;height:48px;border-radius:12px;font:inherit;font-size:1rem}
.k99-login button.k99-btn{cursor:pointer;font-weight:700;border:1px solid #d5dee1;background:#fff;color:#082d38;display:flex;align-items:center;justify-content:center;gap:10px}
.k99-login button.k99-primary{background:#006b5b;border-color:#006b5b;color:#fff;margin-top:10px}
.k99-login button.k99-btn:disabled{opacity:.6;cursor:wait}
.k99-login input{border:1px solid #c9d4d8;padding:0 14px;color:#082d38;background:#fff;text-align:center}
.k99-login input:focus{outline:2px solid #006b5b;outline-offset:1px}
.k99-login input.k99-code{letter-spacing:.4em;text-align:center;font-weight:700;font-size:1.2rem}
.k99-or{display:flex;align-items:center;gap:10px;margin:16px 0;color:#6b7c82;font-size:.85rem}
.k99-or::before,.k99-or::after{content:"";flex:1;height:1px;background:#e3e9eb}
.k99-err{min-height:1.2em;margin:10px 0 0;color:#b42318;font-size:.9rem}
.k99-link{background:none;border:0;padding:0;margin-top:12px;color:#006b5b;font:inherit;font-size:.9rem;text-decoration:underline;cursor:pointer}
.k99-resend{margin:14px 0 0 !important;font-size:.9rem !important;color:#6b7c82 !important}
.k99-resend .k99-link{margin-top:0}
.k99-resend .k99-link:disabled{color:#9aa8ae;text-decoration:none;cursor:default}
.k99-resend [data-timer]{font-variant-numeric:tabular-nums;font-weight:700}
.k99-small{margin:14px 0 0 !important;font-size:.8rem !important;color:#6b7c82 !important}
.k99-toast{position:fixed;left:50%;bottom:90px;z-index:10001;transform:translate(-50%,20px);opacity:0;pointer-events:none;max-width:calc(100% - 32px);background:#082d38;color:#fff;padding:12px 18px;border-radius:12px;font-size:.95rem;transition:.25s}
.k99-toast.show{opacity:1;transform:translate(-50%,0)}`;

  const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

  let modal, lastFocus;
  let stopTimer = () => {};

  function buildModal(){
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    modal = document.createElement("div");
    modal.className = "k99-login";
    modal.hidden = true;
    modal.innerHTML = `
<div class="k99-login-box" role="dialog" aria-modal="true" aria-labelledby="k99LoginTitle">
  <button class="k99-login-close" type="button" aria-label="Close">×</button>
  <div data-step="start">
    <h2 id="k99LoginTitle">Log in to save projects</h2>
    <p>Your saved projects stay in your Keys99 account, on every device.</p>
    <button class="k99-btn" type="button" data-google>${GOOGLE_ICON}<span>Continue with Google</span></button>
    <div class="k99-or">or</div>
    <form data-email-form novalidate>
      <input type="email" name="email" placeholder="Your email address" autocomplete="email" required>
      <button class="k99-btn k99-primary" type="submit">Email me a login code</button>
    </form>
  </div>
  <div data-step="code" hidden>
    <h2>Check your email</h2>
    <p>Enter the code we sent to <strong data-email></strong>.</p>
    <form data-code-form novalidate>
      <input class="k99-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••" required>
      <button class="k99-btn k99-primary" type="submit">Log in</button>
    </form>
    <p class="k99-resend">Didn't get it? <button type="button" class="k99-link" data-resend disabled>Resend code in <span data-timer>0:60</span></button></p>
    <button class="k99-link" type="button" data-back>Use a different email</button>
  </div>
  <p class="k99-err" role="alert"></p>
  <p class="k99-small">New here? Logging in creates your account.</p>
</div>`;
    document.body.appendChild(modal);

    const $ = sel => modal.querySelector(sel);
    const err = text => { $(".k99-err").textContent = text || ""; };
    const busy = (btn, on) => { btn.disabled = on; };
    let email = "";

    $(".k99-login-close").addEventListener("click", () => closeLogin());
    modal.addEventListener("click", e => { if(e.target === modal) closeLogin(); });
    modal.addEventListener("keydown", e => { if(e.key === "Escape") closeLogin(); });

    $("[data-google]").addEventListener("click", async e => {
      const btn = e.currentTarget;
      busy(btn, true); err();
      try{
        const sb = await client();
        const { error } = await sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: returnUrl() }
        });
        if(error) throw error;
      }catch(ex){
        busy(btn, false);
        err("Google login is not available right now. Please use your email instead.");
      }
    });

    /* Another code can be asked for once a minute (Supabase's limit). The
       time of the last code is kept for this tab, so the countdown carries
       on after "Use a different email" or reopening the popup. */
    const RESEND_SECONDS = 60;
    const SENT_KEY = "keys99_otp_sent";
    const resendBtn = $("[data-resend]");
    let timer;

    function secondsLeft(forEmail){
      const sent = store.get("sessionStorage", SENT_KEY);
      if(!sent || sent.email !== forEmail) return 0;
      return Math.max(0, Math.ceil(RESEND_SECONDS - (Date.now() - sent.at) / 1000));
    }

    function startTimer(seconds){
      clearInterval(timer);
      let left = Math.max(0, Math.ceil(seconds));
      const tick = () => {
        if(left > 0){
          resendBtn.disabled = true;
          resendBtn.innerHTML = `Resend code in <span data-timer>${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</span>`;
          left--;
        }else{
          clearInterval(timer);
          resendBtn.disabled = false;
          resendBtn.textContent = "Resend code";
        }
      };
      tick();
      timer = setInterval(tick, 1000);
    }
    stopTimer = () => clearInterval(timer);

    function showCodeStep(){
      $("[data-email]").textContent = email;
      $("[data-step=start]").hidden = true;
      $("[data-step=code]").hidden = false;
      $(".k99-code").value = "";
      $(".k99-code").focus();
    }

    /* Sends a code to `email`. Returns true when one was sent. */
    async function sendCode(){
      try{
        const sb = await client();
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true, emailRedirectTo: returnUrl() }
        });
        if(error) throw error;
        store.set("sessionStorage", SENT_KEY, { email, at: Date.now() });
        startTimer(RESEND_SECONDS);
        return true;
      }catch(ex){
        const wait = /after (\d+) seconds?/i.exec(ex.message || "");
        if(wait){
          /* Supabase still remembers the last code: count down what is left. */
          store.set("sessionStorage", SENT_KEY, { email, at: Date.now() - (RESEND_SECONDS - Number(wait[1])) * 1000 });
          showCodeStep();
          startTimer(Number(wait[1]));
          err(`A code was sent recently. You can ask for another in ${wait[1]} seconds.`);
        }else{
          err(/rate|seconds/i.test(ex.message || "")
            ? "Please wait a minute before asking for another code."
            : "Could not send the code. Please check the email address and try again.");
        }
        return false;
      }
    }

    $("[data-email-form]").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.currentTarget.querySelector("button");
      email = e.currentTarget.email.value.trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ err("Please enter a valid email address."); return; }
      err();
      /* A code for this email went out less than a minute ago: use that one. */
      const left = secondsLeft(email);
      if(left > 0){
        showCodeStep();
        startTimer(left);
        return;
      }
      busy(btn, true);
      if(await sendCode()) showCodeStep();
      busy(btn, false);
    });

    resendBtn.addEventListener("click", async () => {
      if(resendBtn.disabled) return;
      resendBtn.disabled = true;
      err();
      if(await sendCode()){
        $(".k99-code").value = "";
        $(".k99-code").focus();
        toast("New code sent to " + email);
      }else if(!timer || resendBtn.textContent === "Resend code"){
        resendBtn.disabled = false;
      }
    });

    $("[data-code-form]").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = e.currentTarget.querySelector("button");
      const token = e.currentTarget.code.value.replace(/\D/g, "");
      if(token.length < 6){ err("Please enter the code from the email."); return; }
      busy(btn, true); err();
      try{
        const sb = await client();
        const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
        if(error) throw error;
        closeLogin(true);
        toast("You are logged in");
      }catch(ex){
        err("That code did not work. Check it, or ask for a new one.");
      }
      busy(btn, false);
    });

    $("[data-back]").addEventListener("click", () => {
      err();
      $("[data-step=code]").hidden = true;
      $("[data-step=start]").hidden = false;
      $("input[type=email]").focus();
    });
  }

  function openLogin(){
    if(!modal) buildModal();
    client().catch(() => {});                /* start loading while they choose */
    lastFocus = document.activeElement;
    modal.querySelector(".k99-err").textContent = "";
    modal.querySelector("[data-step=start]").hidden = false;
    modal.querySelector("[data-step=code]").hidden = true;
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    modal.querySelector("[data-google]").disabled = false;
    modal.querySelector("input[type=email]").focus();
  }

  function closeLogin(loggedIn){
    if(!modal || modal.hidden) return;
    modal.hidden = true;
    stopTimer();
    document.documentElement.style.overflow = "";
    if(loggedIn !== true) store.del("sessionStorage", PENDING_KEY);
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function logout(){
    const sb = await client();
    await sb.auth.signOut();
    toast("You are logged out");
  }

  /* ---------- start ---------- */
  if(storedLogin() || loginInUrl()){
    const cached = store.get("localStorage", CACHE_KEY);
    if(cached && Array.isArray(cached.items)) saved = new Map(cached.items);
    paint();
    client().catch(() => { ready = true; changed(); });
  }else{
    ready = true;
    paint();
  }

  window.Keys99Account = {
    isReady: () => ready,
    user: () => user,
    profile: () => profile,
    displayName,
    updateProfile,
    changeEmail,
    toast,
    ids: () => [...saved.keys()],
    has: id => saved.has(id),
    toggle,
    paint,
    openLogin,
    logout
  };
})();

/* =========================================================
   KEYS99 - PROFILE PAGE (profile.html)
   Shows one of three states from js/account.js:
   - loading, while the login is being checked (no flash of the
     logged-out card for someone who is logged in),
   - a "Log in to Keys99" card for visitors,
   - the visitor's photo or initial, name, email, counts (saved,
     recently viewed, to compare), shortcuts and Log out.
   Re-renders on the "keys99:saved" event (login, logout, saves).
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

  function nameOf(user){
    const meta = user.user_metadata || {};
    return meta.full_name || meta.name || (user.email || "").split("@")[0] || "Keys99 member";
  }

  function paintAvatar(el, user){
    const meta = user.user_metadata || {};
    const photo = meta.avatar_url || meta.picture;
    el.textContent = "";
    if(photo){
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); el.textContent = nameOf(user).charAt(0).toUpperCase(); };
      el.appendChild(img);
    }else{
      el.textContent = nameOf(user).charAt(0).toUpperCase();
    }
  }

  function render(){
    const ready = account.isReady();
    const user = account.user();
    $("profileLoading").hidden = ready;
    $("profileGuest").hidden = !ready || !!user;
    $("profileUser").hidden = !ready || !user;
    if(!user) return;

    paintAvatar($("profileAvatar"), user);
    $("profileName").textContent = nameOf(user);
    $("profileEmail").textContent = user.email || "";
    $("statSaved").textContent = account.ids().length;
    $("statRecent").textContent = readList("keys99_recently_viewed").length;
    $("statCompare").textContent = window.Keys99Compare ? Keys99Compare.list().length : 0;
  }

  $("profileLogin").addEventListener("click", () => account.openLogin());
  $("profileLogout").addEventListener("click", () => account.logout());
  document.addEventListener("keys99:saved", render);
  window.addEventListener("pageshow", render);

  render();
})();

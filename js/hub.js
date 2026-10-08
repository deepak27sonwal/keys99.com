/* =========================================================
   KEYS99 - CITY / LOCALITY HUB PAGES (behaviour only)
   The content is in the HTML (build/hubs.js); this adds the
   menu and bottom navigation. Project card behaviour (favourites,
   click-through, BHK scrolling) is in js/cards.js.
========================================================= */

(function(){

  const ROOT = document.body.dataset.root || "";

  /* ---- mobile menu ---- */
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  if(menuBtn && mobileMenu){
    menuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
      menuBtn.textContent = mobileMenu.classList.contains("open") ? "×" : "☰";
    });
  }

  const loginBtn = document.getElementById("loginBtn");
  if(loginBtn) loginBtn.addEventListener("click", () => { window.location.href = ROOT + "saved"; });

  /* ---- bottom navigation ---- */
  const bottomNav = document.getElementById("bottomNav");
  if(bottomNav){
    const targets = { home:"./", search:"projects/search", reels:"reels", saved:"saved", profile:"profile" };
    bottomNav.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if(btn && targets[btn.dataset.target]) window.location.href = ROOT + targets[btn.dataset.target];
    });
  }

})();

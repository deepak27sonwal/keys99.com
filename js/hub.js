/* =========================================================
   KEYS99 - CITY / LOCALITY HUB PAGES (behaviour only)
   The content is in the HTML (build/hubs.js); this adds the
   same interactions the homepage cards have: favourites, card
   click-through, one-row BHK scrolling, menu and bottom nav.
========================================================= */

(function(){

  const ROOT = document.body.dataset.root || "";

  /* ---- favourites (shared with the rest of the site) ---- */
  function getFavorites(){
    try{
      const list = JSON.parse(localStorage.getItem("keys99_favorites") || "[]");
      return Array.isArray(list) ? list : [];
    }catch(_){
      return [];
    }
  }

  function setFavorites(list){
    try{ localStorage.setItem("keys99_favorites", JSON.stringify(list)); }catch(_){}
  }

  document.querySelectorAll(".property-card .fav").forEach(btn => {
    const id = btn.dataset.propertyId;
    const paint = on => { btn.classList.toggle("active", on); btn.textContent = on ? "♥" : "♡"; };
    paint(getFavorites().includes(id));
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const list = getFavorites();
      const on = !list.includes(id);
      setFavorites(on ? [...list, id] : list.filter(x => x !== id));
      paint(on);
    });
  });

  /* ---- whole card opens the project ---- */
  document.querySelectorAll(".property-card").forEach(card => {
    card.addEventListener("click", e => {
      if(e.target.closest("a, button, .bhk-scroll")) return;
      const link = card.querySelector(".card-link");
      if(link) window.location.href = link.href;
    });
  });

  /* ---- one BHK row at a time, with scroller + counter ---- */
  function fitBhkScrolls(){
    document.querySelectorAll(".bhk-scroll").forEach(scroll => {
      const first = scroll.firstElementChild;
      if(!first) return;
      scroll.style.maxHeight = first.offsetHeight + "px";

      const wrap = scroll.parentElement;
      const count = wrap.querySelector(".bhk-count");
      const thumb = wrap.querySelector(".bhk-thumb");
      if(!count) return;

      const total = scroll.children.length;
      const update = () => {
        const max = scroll.scrollHeight - scroll.clientHeight;
        const ratio = max > 0 ? scroll.scrollTop / max : 0;
        const step = first.offsetHeight + (parseFloat(getComputedStyle(scroll).rowGap) || 0);
        count.textContent = `${Math.min(total, Math.round(scroll.scrollTop / step) + 1)}/${total} ↕`;
        if(thumb){
          const track = thumb.parentElement.clientHeight;
          const size = Math.max(10, track / total);
          thumb.style.height = size + "px";
          thumb.style.transform = `translateY(${ratio * (track - size)}px)`;
        }
        wrap.classList.toggle("at-end", ratio >= 0.99);
      };
      update();
      if(!scroll._bound){
        scroll._bound = true;
        scroll.addEventListener("scroll", update, { passive:true });
      }
    });
  }

  fitBhkScrolls();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitBhkScrolls, 150);
  });

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
  if(loginBtn) loginBtn.addEventListener("click", () => { window.location.href = ROOT + "saved.html"; });

  /* ---- bottom navigation ---- */
  const bottomNav = document.getElementById("bottomNav");
  if(bottomNav){
    const targets = { home:"./", search:"projects/search.html", reels:"reels.html", saved:"saved.html", profile:"saved.html" };
    bottomNav.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if(btn && targets[btn.dataset.target]) window.location.href = ROOT + targets[btn.dataset.target];
    });
  }

})();

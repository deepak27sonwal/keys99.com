/* =========================================================
   KEYS99 - PROJECT CARD BEHAVIOUR
   For the project cards that build/ writes into the page (hubs,
   search, saved, and Similar Projects on project pages): tapping anywhere on a card to open it, and the one-row
   BHK scroller with its counter. The homepage does the same in
   js/home.js for the cards it renders itself.
========================================================= */

(function(){

  /* The save heart (.fav) is handled by js/account.js. */

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

})();

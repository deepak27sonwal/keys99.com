/* =========================================================
   KEYS99 - SAVED PAGE (saved.html)
   Every project's card is in #savedPool. The ones this browser has
   hearted (keys99_favorites) go into "Saved"; recently viewed ones
   (keys99_recently_viewed) that are not saved go into "Recently
   Viewed". Cards are moved, not copied, so their buttons keep
   working; un-hearting a card moves it out again.
========================================================= */

(function(){
  const pool = document.getElementById("savedPool");
  const savedList = document.getElementById("savedList");
  const recentList = document.getElementById("recentList");
  if(!pool || !savedList || !recentList) return;

  const read = key => {
    try{
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v.map(String) : [];
    }catch(_){ return []; }
  };

  const cards = new Map();
  pool.querySelectorAll(".property-card").forEach(card => {
    const fav = card.querySelector("[data-property-id]");
    if(fav) cards.set(fav.dataset.propertyId, card);
  });

  function render(){
    const saved = read("keys99_favorites").filter(id => cards.has(id));
    const recent = read("keys99_recently_viewed").filter(id => cards.has(id) && !saved.includes(id)).slice(0, 8);

    cards.forEach(card => pool.appendChild(card));
    saved.forEach(id => savedList.appendChild(cards.get(id)));
    recent.forEach(id => recentList.appendChild(cards.get(id)));

    document.getElementById("savedCount").textContent = saved.length ? `(${saved.length})` : "";
    document.getElementById("savedEmpty").hidden = saved.length > 0;
    document.getElementById("recentSection").hidden = recent.length === 0;

    /* Cards that were hidden when their BHK rows were sized need it again. */
    window.dispatchEvent(new Event("resize"));
  }

  /* After a heart is toggled. Capture phase, as the heart's own handler
     stops the click from bubbling; the timeout runs after it has saved. */
  document.addEventListener("click", e => {
    if(e.target.closest && e.target.closest(".fav")) setTimeout(render, 0);
  }, true);
  window.addEventListener("storage", e => {
    if(e.key === "keys99_favorites" || e.key === "keys99_recently_viewed") render();
  });

  render();
})();

/* =========================================================
   KEYS99 - SAVED PAGE (saved.html)
   Every project's card is in #savedPool. The ones saved to the
   visitor's account (js/account.js) go into "Saved", newest first;
   recently viewed ones (keys99_recently_viewed, this browser) that
   are not saved go into "Recently Viewed". A visitor who is not
   logged in is asked to log in to see their saved projects. Cards
   are moved, not copied, so their buttons keep working; un-hearting
   a card moves it out again.
========================================================= */

(function(){
  const pool = document.getElementById("savedPool");
  const savedList = document.getElementById("savedList");
  const recentList = document.getElementById("recentList");
  if(!pool || !savedList || !recentList) return;

  const $ = id => document.getElementById(id);
  const account = window.Keys99Account;

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

  /* Logged-in bar and logged-out prompt, added once. */
  const section = savedList.closest("section");
  const bar = document.createElement("div");
  bar.className = "saved-account";
  bar.hidden = true;
  bar.innerHTML = `<span></span> <button type="button" class="saved-logout">Log out</button>`;
  section.insertBefore(bar, savedList);
  bar.querySelector("button").addEventListener("click", () => account && account.logout());

  const prompt = document.createElement("div");
  prompt.className = "search-empty";
  prompt.hidden = true;
  prompt.innerHTML = `<strong>Log in to see your saved projects.</strong>
    <p>Saved projects are kept in your Keys99 account, so they are on every device you use.</p>
    <button class="btn-primary" type="button">Log in</button>`;
  section.appendChild(prompt);
  prompt.querySelector("button").addEventListener("click", () => account && account.openLogin());

  function render(){
    const ready = account && account.isReady();
    const user = account && account.user();
    const saved = user ? account.ids().filter(id => cards.has(id)) : [];
    const recent = read("keys99_recently_viewed").filter(id => cards.has(id) && !saved.includes(id)).slice(0, 8);

    cards.forEach(card => pool.appendChild(card));
    saved.forEach(id => savedList.appendChild(cards.get(id)));
    recent.forEach(id => recentList.appendChild(cards.get(id)));

    $("savedCount").textContent = saved.length ? `(${saved.length})` : "";
    $("savedEmpty").hidden = !(ready && user) || saved.length > 0;
    prompt.hidden = !(ready && !user);
    bar.hidden = !user;
    if(user) bar.querySelector("span").textContent = `Logged in as ${user.email || "your account"}`;
    $("recentSection").hidden = recent.length === 0;

    /* Cards that were hidden when their BHK rows were sized need it again. */
    window.dispatchEvent(new Event("resize"));
  }

  document.addEventListener("keys99:saved", render);
  window.addEventListener("storage", e => { if(e.key === "keys99_recently_viewed") render(); });

  render();
})();

/* =========================================================
   KEYS99 - CUSTOM DROPDOWN

   Replaces the look of every <select> with a styled dropdown,
   while the real <select> stays in the page (visually hidden)
   and remains the source of truth:

   - page scripts keep reading/setting select.value and
     listening for "change" exactly as before
   - options added or removed by scripts appear automatically
   - choosing an item sets the select and fires input + change

   Keyboard: Enter/Space/ArrowDown opens; arrows, Home/End and
   typing a letter move; Enter selects; Escape/Tab closes.

   Opt out per element with <select data-native>.
========================================================= */

(function(){

  const OPEN_CLASS = "cs-open";
  let openInstance = null;
  let uid = 0;

  const proto = HTMLSelectElement.prototype;
  const valueDesc = Object.getOwnPropertyDescriptor(proto, "value");
  const indexDesc = Object.getOwnPropertyDescriptor(proto, "selectedIndex");

  function enhance(select){
    if(select._cs || select.multiple || select.hasAttribute("data-native")) return;

    const id = "cs-" + (++uid);

    const wrap = document.createElement("div");
    wrap.className = "cs";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cs-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", id + "-list");
    trigger.innerHTML =
      '<span class="cs-value"></span>' +
      '<svg class="cs-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const menu = document.createElement("ul");
    menu.className = "cs-menu";
    menu.id = id + "-list";
    menu.setAttribute("role", "listbox");
    menu.tabIndex = -1;
    menu.hidden = true;

    /* The button goes first so a wrapping <label> activates it.
       The menu lives on <body> so no parent's overflow or stacking
       can clip or cover it; it is positioned under the field. */
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(trigger);
    wrap.appendChild(select);
    document.body.appendChild(menu);

    /* Line the menu up with the visible field: the wrapping label
       in the search bar / enquiry card, otherwise the dropdown. */
    const anchor = select.closest("label") || wrap;
    if(select.closest(".enquiry-card")) menu.classList.add("cs-menu--dark-field");
    select.classList.add("cs-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    /* Name the button after the select's own label, if it has one. */
    const label = select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
    if(label){
      if(!label.id) label.id = id + "-label";
      trigger.setAttribute("aria-labelledby", label.id + " " + id + "-value");
      trigger.querySelector(".cs-value").id = id + "-value";
      label.addEventListener("click", e => { e.preventDefault(); trigger.focus(); open(); });
    }else if(select.getAttribute("aria-label")){
      trigger.setAttribute("aria-label", select.getAttribute("aria-label"));
    }

    let active = -1;
    let typed = "", typedTimer = null;

    const items = () => [...menu.querySelectorAll(".cs-option")];

    /* <select data-searchable>: a search box at the top of the list
       narrows the options as you type. */
    const searchable = select.hasAttribute("data-searchable");
    let searchLi = null, searchInput = null, emptyLi = null, query = "";
    if(searchable){
      searchLi = document.createElement("li");
      searchLi.className = "cs-search";
      searchLi.setAttribute("role", "presentation");
      searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.className = "cs-search-input";
      searchInput.autocomplete = "off";
      searchInput.placeholder = select.getAttribute("data-search-placeholder") || "Search";
      searchInput.setAttribute("aria-label", searchInput.placeholder);
      searchLi.appendChild(searchInput);
      emptyLi = document.createElement("li");
      emptyLi.className = "cs-empty";
      emptyLi.textContent = "No matches";
    }

    function build(){
      if(searchable){
        if(!searchLi.parentNode) menu.appendChild(searchLi);
        menu.querySelectorAll(".cs-option, .cs-empty").forEach(n => n.remove());
      }else menu.innerHTML = "";
      const q = query.trim().toLowerCase();
      [...select.options].forEach((opt, i) => {
        if(opt.hidden) return;
        if(q && (!opt.value || !opt.textContent.toLowerCase().includes(q))) return;
        const li = document.createElement("li");
        li.className = "cs-option";
        li.id = `${id}-opt-${i}`;
        li.setAttribute("role", "option");
        li.dataset.index = i;
        li.textContent = opt.textContent;
        if(opt.disabled) li.setAttribute("aria-disabled", "true");
        menu.appendChild(li);
      });
      if(searchable && !menu.querySelector(".cs-option")) menu.appendChild(emptyLi);
      sync();
    }

    function sync(){
      const opt = select.options[select.selectedIndex];
      trigger.querySelector(".cs-value").textContent = opt ? opt.textContent : "";
      wrap.classList.toggle("cs-placeholder", !opt || opt.value === "");
      wrap.classList.toggle("cs-disabled", select.disabled);
      trigger.disabled = select.disabled;
      items().forEach(li => {
        const selected = Number(li.dataset.index) === select.selectedIndex;
        li.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    function setActive(pos){
      const list = items().filter(li => li.getAttribute("aria-disabled") !== "true");
      if(!list.length) return;
      pos = Math.max(0, Math.min(list.length - 1, pos));
      items().forEach(li => li.classList.remove("cs-active"));
      const li = list[pos];
      li.classList.add("cs-active");
      active = pos;
      menu.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block:"nearest" });
    }

    function activeList(){
      return items().filter(li => li.getAttribute("aria-disabled") !== "true");
    }

    function open(){
      if(select.disabled || !menu.hidden) return;
      if(openInstance && openInstance !== api) openInstance.close();
      query = "";
      if(searchable) searchInput.value = "";
      build();
      menu.hidden = false;
      wrap.classList.add(OPEN_CLASS);
      trigger.setAttribute("aria-expanded", "true");
      openInstance = api;

      position();

      const list = activeList();
      const current = list.findIndex(li => Number(li.dataset.index) === select.selectedIndex);
      setActive(current >= 0 ? current : 0);
      if(searchable) searchInput.focus({ preventScroll:true });
    }

    function position(){
      const r = anchor.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const up = below < Math.min(menu.scrollHeight, 260) + 12 && r.top > below;
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) + "px";
      menu.style.minWidth = r.width + "px";
      menu.style.maxWidth = (window.innerWidth - 16) + "px";
      menu.style.top = up ? "" : (r.bottom + 6) + "px";
      menu.style.bottom = up ? (window.innerHeight - r.top + 6) + "px" : "";
      menu.classList.toggle("cs-menu--up", up);
    }

    function close(focusTrigger){
      if(menu.hidden) return;
      menu.hidden = true;
      wrap.classList.remove(OPEN_CLASS);
      trigger.setAttribute("aria-expanded", "false");
      menu.removeAttribute("aria-activedescendant");
      if(openInstance === api) openInstance = null;
      if(focusTrigger) trigger.focus();
    }

    function choose(index){
      const opt = select.options[index];
      if(!opt || opt.disabled) return;
      const changed = select.selectedIndex !== index;
      indexDesc.set.call(select, index);
      sync();
      close(true);
      if(changed){
        select.dispatchEvent(new Event("input", { bubbles:true }));
        select.dispatchEvent(new Event("change", { bubbles:true }));
      }
    }

    trigger.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      menu.hidden ? open() : close();
    });

    menu.addEventListener("mousedown", e => { if(!e.target.closest(".cs-search")) e.preventDefault(); });
    if(searchable){
      searchInput.addEventListener("input", () => {
        query = searchInput.value;
        build();
        setActive(0);
      });
      searchInput.addEventListener("keydown", e => {
        if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(true); return; }
        if(e.key === "Tab"){ close(); return; }
        if(["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(e.key) && e.key !== "Home" && e.key !== "End"){
          e.preventDefault();
          const list = activeList();
          if(e.key === "ArrowDown") setActive(active + 1);
          else if(e.key === "ArrowUp") setActive(active - 1);
          else if(list[active]) choose(Number(list[active].dataset.index));
        }
      });
    }
    menu.addEventListener("click", e => {
      /* The menu sits on <body>, outside whatever panel holds the
         field; page code that closes a panel on "click outside"
         must not see a click in the menu. */
      e.stopPropagation();
      const li = e.target.closest(".cs-option");
      if(li && li.getAttribute("aria-disabled") !== "true") choose(Number(li.dataset.index));
    });
    menu.addEventListener("mousemove", e => {
      const li = e.target.closest(".cs-option");
      if(!li) return;
      const pos = activeList().indexOf(li);
      if(pos >= 0 && pos !== active) setActive(pos);
    });

    trigger.addEventListener("keydown", e => {
      const isOpen = !menu.hidden;
      const list = activeList();
      switch(e.key){
        case "ArrowDown":
          e.preventDefault();
          isOpen ? setActive(active + 1) : open();
          break;
        case "ArrowUp":
          e.preventDefault();
          isOpen ? setActive(active - 1) : open();
          break;
        case "Home":
          if(isOpen){ e.preventDefault(); setActive(0); }
          break;
        case "End":
          if(isOpen){ e.preventDefault(); setActive(list.length - 1); }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if(isOpen && list[active]) choose(Number(list[active].dataset.index));
          else open();
          break;
        case "Escape":
          /* Close only this dropdown, not a panel or dialog around it. */
          if(isOpen){ e.preventDefault(); e.stopPropagation(); close(true); }
          break;
        case "Tab":
          close();
          break;
        default:
          if(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
            typed += e.key.toLowerCase();
            clearTimeout(typedTimer);
            typedTimer = setTimeout(() => { typed = ""; }, 600);
            if(!isOpen) open();
            const pos = activeList().findIndex(li => li.textContent.trim().toLowerCase().startsWith(typed));
            if(pos >= 0) setActive(pos);
          }
      }
    });

    /* A focused hidden select (e.g. from a <label for>) hands focus on. */
    select.addEventListener("focus", () => trigger.focus());
    select.addEventListener("change", sync);

    /* Scripts that rebuild options, or set .value / .selectedIndex
       directly (which fires no event), still update the button. */
    new MutationObserver(() => menu.hidden ? sync() : build())
      .observe(select, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["disabled","selected","hidden"] });

    Object.defineProperty(select, "value", {
      configurable:true,
      get(){ return valueDesc.get.call(this); },
      set(v){ valueDesc.set.call(this, v); sync(); }
    });
    Object.defineProperty(select, "selectedIndex", {
      configurable:true,
      get(){ return indexDesc.get.call(this); },
      set(v){ indexDesc.set.call(this, v); sync(); }
    });

    const form = select.form;
    if(form) form.addEventListener("reset", () => setTimeout(sync));

    const api = { open, close, position, refresh: build, trigger, select, menu };
    select._cs = api;
    build();
  }

  function enhanceAll(root){
    (root || document).querySelectorAll("select").forEach(enhance);
  }

  document.addEventListener("click", e => {
    if(openInstance && !e.target.closest(".cs") && !e.target.closest(".cs-menu")) openInstance.close();
  });
  window.addEventListener("resize", () => openInstance && openInstance.close());

  /* Keep an open menu attached to its field while the page or a
     panel scrolls; close it once the field scrolls out of view. */
  document.addEventListener("scroll", e => {
    if(!openInstance || openInstance.menu.contains(e.target)) return;
    const r = openInstance.trigger.getBoundingClientRect();
    if(r.bottom < 0 || r.top > window.innerHeight) openInstance.close();
    else openInstance.position();
  }, true);

  /* Selects added later (rendered by page scripts) get enhanced too. */
  function start(){
    enhanceAll();
    new MutationObserver(records => {
      records.forEach(r => r.addedNodes.forEach(n => {
        if(n.nodeType !== 1) return;
        if(n.tagName === "SELECT") enhance(n);
        else if(n.querySelectorAll) enhanceAll(n);
      }));
    }).observe(document.body, { childList:true, subtree:true });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.Keys99Select = {
    enhance,
    enhanceAll,
    refresh(select){ if(select && select._cs) select._cs.refresh(); }
  };

})();

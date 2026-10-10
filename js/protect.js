/* =========================================================
   KEYS99 - DETERRENT AGAINST CASUAL INSPECTING

   Stops the easy routes: right-click, F12, the DevTools shortcuts,
   View Source and Save Page. This is a deterrent only - a page's
   code is always sent to the browser, so someone determined can
   still read it - and it never hides anything: typing, copy and
   paste, selecting text, forms, zoom, find and print all work, and
   crawlers and screen readers are unaffected (only user events are
   handled). Not added to admin/leads.html.
========================================================= */

(function(){
  const isField = el => !!(el && el.closest && el.closest("input, textarea, select, [contenteditable='true']"));

  document.addEventListener("contextmenu", e => {
    if(!isField(e.target)) e.preventDefault();
  });

  document.addEventListener("keydown", e => {
    const key = String(e.key || "").toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const blocked =
      e.key === "F12" ||
      (mod && e.shiftKey && ["i", "j", "c", "k"].includes(key)) ||   // DevTools, console, element picker, Firefox console
      (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(key)) || // Mac: Cmd+Option+I / J / C / U
      (mod && !e.shiftKey && !e.altKey && ["u", "s"].includes(key));   // View Source, Save Page
    if(blocked){
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener("dragstart", e => {
    if(e.target && e.target.tagName === "IMG") e.preventDefault();
  });
})();

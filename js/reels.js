/* =========================================================
   KEYS99 - REELS PAGE (reels.html)
   Each video shows a thumbnail first; tapping it swaps in the real
   player (YouTube / Instagram / Facebook), so the page does not load
   every player up front. Starting one video stops the others.
========================================================= */

(function(){
  document.addEventListener("click", e => {
    const btn = e.target.closest && e.target.closest(".reel-play");
    if(!btn) return;

    /* Only one playing at a time: put the others back to thumbnails. */
    document.querySelectorAll(".reel-media iframe").forEach(frame => {
      const back = frame.__thumb;
      if(back) frame.replaceWith(back);
    });

    const frame = document.createElement("iframe");
    frame.src = btn.dataset.embed;
    frame.title = btn.getAttribute("aria-label") || "Project video";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.__thumb = btn;
    btn.replaceWith(frame);
  });
})();

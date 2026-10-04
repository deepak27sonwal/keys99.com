/* =========================================================
   KEYS99 - BOTTOM NAVIGATION PRESS EFFECT

   Pressing a tab in the bottom navigation:
   - tilts the tab back a little and presses it in (3D),
   - makes the icon wobble like a drop settling (squash,
     stretch, settle).
   The active tab's highlight becomes a glossy, raised bubble.

   It starts on pointerdown, before the tab's own click handler
   navigates, so it never delays navigation; the animation keeps
   playing while the next page loads. Self-contained: the styles
   are added here, and nothing happens for visitors who ask for
   reduced motion (the bubble highlight still shows).
========================================================= */

(function(){

  const nav = document.getElementById("bottomNav");
  if(!nav) return;

  const style = document.createElement("style");
  style.textContent = `
    .bottom-nav button{
      position:relative;
      -webkit-tap-highlight-color:transparent;
      transform-origin:50% 100%;
    }
    .bottom-nav .bn-icon,
    .bottom-nav .bn-label{
      position:relative;
      z-index:1;
    }
    .bottom-nav button.bn-active .bn-icon{
      background:
        radial-gradient(circle at 30% 22%, rgba(255,255,255,.95) 0, rgba(255,255,255,0) 42%),
        linear-gradient(180deg, #effaf6 0%, #cfeee4 100%);
      box-shadow:
        inset 0 2px 3px rgba(255,255,255,.9),
        inset 0 -3px 5px rgba(0,107,91,.16),
        0 4px 10px rgba(0,107,91,.22);
    }
    .bottom-nav button.bn-press{
      animation:bnTilt .42s ease-out;
    }
    .bottom-nav button.bn-press .bn-icon{
      animation:bnWobble .6s cubic-bezier(.3,1.4,.5,1);
    }
    @keyframes bnTilt{
      0%{ transform:none; }
      30%{ transform:perspective(260px) rotateX(16deg) translateY(1px) scale(.95); }
      100%{ transform:none; }
    }
    @keyframes bnWobble{
      0%{ transform:translateY(0) scale(1); }
      20%{ transform:translateY(2px) scale(1.18, .8); }
      45%{ transform:translateY(-4px) scale(.9, 1.12); }
      70%{ transform:translateY(0) scale(1.05, .96); }
      100%{ transform:translateY(-1px) scale(1); }
    }
  `;
  document.head.appendChild(style);

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduceMotion) return;

  nav.addEventListener("pointerdown", event => {
    const button = event.target.closest("button");
    if(!button || !nav.contains(button)) return;

    /* Restart the press animation even on a quick second tap. */
    button.classList.remove("bn-press");
    void button.offsetWidth;
    button.classList.add("bn-press");
  }, { passive: true });

  nav.addEventListener("animationend", event => {
    if(event.target.classList && event.target.classList.contains("bn-press") && event.animationName === "bnTilt"){
      event.target.classList.remove("bn-press");
    }
  });

})();

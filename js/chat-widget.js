/* =========================================================
   KEYS99 - FLOATING CHAT WIDGET
   Loaded on every page after js/config.js. Talks to the
   "chat-agent" Supabase Edge Function, which proxies to the
   Claude API server-side (the Anthropic key never reaches
   the browser). Self-injects its own DOM - no HTML markup
   needed on the pages that include this script.
========================================================= */

(function(){

  const STORAGE_KEY = "keys99_chat_history";
  const GREETING = "Hi! I'm the Keys99 assistant 👋 Ask me anything about buying or renting, or tell me what you're looking for - e.g. “2 BHK in Pune under 60 lakh” - and I'll find real listings for you.";
  const FALLBACK_REPLY = "Sorry, I'm having trouble connecting right now. Please try again in a moment, or reach us from the Contact section.";
  const STARTER_SUGGESTIONS = ["Buy a property", "Rent a property", "Calculate my EMI", "How does Keys99 work?"];

  let widgetRoot, panelEl, messagesEl, formEl, inputEl, launcherEl, launcherIconEl;
  let isOpen = false;
  let isSending = false;
  let activeSuggestionRow = null;

  function getHistory(){
    try{
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    }catch(error){
      return [];
    }
  }

  function saveHistory(history){
    try{
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-30)));
    }catch(error){
      /* sessionStorage unavailable (private mode, etc.) - conversation just won't persist across pages */
    }
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* Minimal, dependency-free markdown: **bold**, [text](url), line breaks. */
  function renderRichText(text){

    let safe = escapeHtml(text);

    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const isSafeUrl = /^https?:\/\//i.test(url) || /^[a-z0-9_-]+\.html/i.test(url);
      const href = isSafeUrl ? url : "#";
      return `<a href="${escapeHtml(href)}">${label}</a>`;
    });

    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\n/g, "<br>");

    return safe;

  }

  function buildWidget(){

    widgetRoot = document.createElement("div");
    widgetRoot.id = "keys99-chat-widget";

    widgetRoot.innerHTML = `
      <button type="button" class="cw-launcher" id="cwLauncher" aria-label="Chat with Keys99">
        <span class="cw-launcher-icon">💬</span>
      </button>
      <div class="cw-panel" id="cwPanel" hidden>
        <div class="cw-header">
          <div class="cw-header-info">
            <span class="cw-avatar">K</span>
            <div>
              <strong>Keys99 Assistant</strong>
              <span>Ask about listings, EMI, or the process</span>
            </div>
          </div>
          <button type="button" class="cw-close-btn" id="cwCloseBtn" aria-label="Close chat">×</button>
        </div>
        <div class="cw-messages" id="cwMessages"></div>
        <form class="cw-input-row" id="cwForm">
          <input type="text" id="cwInput" placeholder="Type your message..." autocomplete="off" maxlength="500">
          <button type="submit" aria-label="Send">➤</button>
        </form>
      </div>
    `;

    document.body.appendChild(widgetRoot);

    panelEl = widgetRoot.querySelector("#cwPanel");
    messagesEl = widgetRoot.querySelector("#cwMessages");
    formEl = widgetRoot.querySelector("#cwForm");
    inputEl = widgetRoot.querySelector("#cwInput");
    launcherEl = widgetRoot.querySelector("#cwLauncher");
    launcherIconEl = widgetRoot.querySelector(".cw-launcher-icon");

    launcherEl.addEventListener("click", toggleOpen);
    widgetRoot.querySelector("#cwCloseBtn").addEventListener("click", () => setOpen(false));
    formEl.addEventListener("submit", onSubmit);

  }

  function toggleOpen(){
    setOpen(!isOpen);
  }

  function setOpen(open){

    isOpen = open;
    panelEl.hidden = !open;
    launcherEl.classList.toggle("cw-launcher-open", open);
    launcherIconEl.textContent = open ? "×" : "💬";

    if(open){
      renderMessages();
      inputEl.focus();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

  }

  function appendMessageEl(role, html){
    const row = document.createElement("div");
    row.className = "cw-msg cw-msg-" + role;
    row.innerHTML = `<div class="cw-bubble">${html}</div>`;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  /* Renders tappable quick-reply chips right after a given message row.
     Tapping one sends its text just like typing + submit. Only one set
     of chips is ever live at a time - clicking any chip, or sending a
     new message, clears the row so stale suggestions can't be tapped. */
  function renderSuggestionChips(suggestions){

    clearSuggestionChips();

    if(!suggestions || !suggestions.length){
      return;
    }

    const row = document.createElement("div");
    row.className = "cw-suggestions";

    suggestions.forEach(text => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cw-suggestion-chip";
      chip.textContent = text;
      chip.addEventListener("click", () => {
        clearSuggestionChips();
        sendMessage(text);
      });
      row.appendChild(chip);
    });

    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    activeSuggestionRow = row;

  }

  function clearSuggestionChips(){
    if(activeSuggestionRow){
      activeSuggestionRow.remove();
      activeSuggestionRow = null;
    }
  }

  function renderMessages(){

    messagesEl.innerHTML = "";
    activeSuggestionRow = null;

    const history = getHistory();

    if(!history.length){
      appendMessageEl("assistant", renderRichText(GREETING));
      renderSuggestionChips(STARTER_SUGGESTIONS);
      return;
    }

    history.forEach(message => {
      appendMessageEl(message.role, renderRichText(message.content));
    });

  }

  async function sendMessage(text){

    text = String(text || "").trim();

    if(!text || isSending){
      return;
    }

    clearSuggestionChips();

    const history = getHistory();
    history.push({ role:"user", content:text });
    saveHistory(history);
    appendMessageEl("user", renderRichText(text));

    isSending = true;

    const typingRow = appendMessageEl("assistant", `<span class="cw-typing-dots"><span></span><span></span><span></span></span>`);

    try{

      const response = await fetch(SUPABASE_URL + "/functions/v1/chat-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          "apikey": SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ messages: history.slice(-16) })
      });

      const data = await response.json().catch(() => null);
      const reply = (data && typeof data.reply === "string" && data.reply) || FALLBACK_REPLY;
      const suggestions = (data && Array.isArray(data.suggestions)) ? data.suggestions : [];

      typingRow.remove();
      appendMessageEl("assistant", renderRichText(reply));
      renderSuggestionChips(suggestions);

      const updated = getHistory();
      updated.push({ role:"assistant", content:reply });
      saveHistory(updated);

    }catch(error){

      console.error("Chat widget error:", error);
      typingRow.remove();
      appendMessageEl("assistant", renderRichText(FALLBACK_REPLY));

    }finally{
      isSending = false;
    }

  }

  function onSubmit(event){

    event.preventDefault();

    const text = inputEl.value.trim();

    if(!text || isSending){
      return;
    }

    inputEl.value = "";
    sendMessage(text);

  }

  function init(){

    if(typeof supabaseClient === "undefined" || typeof SUPABASE_URL === "undefined"){
      return;
    }

    buildWidget();

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();

/* =========================================================
   KEYS99 - PHONE NUMBERS WITH A COUNTRY CODE
   window.Keys99Phone, used by the login popup's "Welcome" step
   (js/account.js) and Profile settings (js/profile.js).

   picker(input): puts a country picker before a phone input - a
   button with the flag and code ("🇮🇳 +91") that opens a searchable
   list of every country, India first and chosen by default.
   read(input): "+<code><digits>", or an error message.
   set(input, "+9715..."): picks the country and fills the number.
   pretty("+919876543210"): "+91 98765 43210".

   Numbers are stored as one string, "+<country code><number>".
========================================================= */

(function(){
  if(window.Keys99Phone) return;

  /* ISO code | name | dialling code. India first, then A-Z. */
  const LIST = ("IN|India|91;AF|Afghanistan|93;AL|Albania|355;DZ|Algeria|213;AD|Andorra|376;AO|Angola|244;" +
    "AG|Antigua and Barbuda|1268;AR|Argentina|54;AM|Armenia|374;AU|Australia|61;AT|Austria|43;AZ|Azerbaijan|994;" +
    "BS|Bahamas|1242;BH|Bahrain|973;BD|Bangladesh|880;BB|Barbados|1246;BY|Belarus|375;BE|Belgium|32;BZ|Belize|501;" +
    "BJ|Benin|229;BT|Bhutan|975;BO|Bolivia|591;BA|Bosnia and Herzegovina|387;BW|Botswana|267;BR|Brazil|55;" +
    "BN|Brunei|673;BG|Bulgaria|359;BF|Burkina Faso|226;BI|Burundi|257;KH|Cambodia|855;CM|Cameroon|237;CA|Canada|1;" +
    "CV|Cape Verde|238;CF|Central African Republic|236;TD|Chad|235;CL|Chile|56;CN|China|86;CO|Colombia|57;" +
    "KM|Comoros|269;CG|Congo|242;CD|Congo (DRC)|243;CR|Costa Rica|506;CI|Côte d'Ivoire|225;HR|Croatia|385;CU|Cuba|53;" +
    "CY|Cyprus|357;CZ|Czechia|420;DK|Denmark|45;DJ|Djibouti|253;DM|Dominica|1767;DO|Dominican Republic|1809;" +
    "EC|Ecuador|593;EG|Egypt|20;SV|El Salvador|503;GQ|Equatorial Guinea|240;ER|Eritrea|291;EE|Estonia|372;" +
    "SZ|Eswatini|268;ET|Ethiopia|251;FJ|Fiji|679;FI|Finland|358;FR|France|33;GA|Gabon|241;GM|Gambia|220;" +
    "GE|Georgia|995;DE|Germany|49;GH|Ghana|233;GR|Greece|30;GD|Grenada|1473;GT|Guatemala|502;GN|Guinea|224;" +
    "GW|Guinea-Bissau|245;GY|Guyana|592;HT|Haiti|509;HN|Honduras|504;HK|Hong Kong|852;HU|Hungary|36;IS|Iceland|354;" +
    "ID|Indonesia|62;IR|Iran|98;IQ|Iraq|964;IE|Ireland|353;IL|Israel|972;IT|Italy|39;JM|Jamaica|1876;JP|Japan|81;" +
    "JO|Jordan|962;KZ|Kazakhstan|7;KE|Kenya|254;KI|Kiribati|686;KW|Kuwait|965;KG|Kyrgyzstan|996;LA|Laos|856;" +
    "LV|Latvia|371;LB|Lebanon|961;LS|Lesotho|266;LR|Liberia|231;LY|Libya|218;LI|Liechtenstein|423;LT|Lithuania|370;" +
    "LU|Luxembourg|352;MO|Macau|853;MG|Madagascar|261;MW|Malawi|265;MY|Malaysia|60;MV|Maldives|960;ML|Mali|223;" +
    "MT|Malta|356;MH|Marshall Islands|692;MR|Mauritania|222;MU|Mauritius|230;MX|Mexico|52;FM|Micronesia|691;" +
    "MD|Moldova|373;MC|Monaco|377;MN|Mongolia|976;ME|Montenegro|382;MA|Morocco|212;MZ|Mozambique|258;MM|Myanmar|95;" +
    "NA|Namibia|264;NR|Nauru|674;NP|Nepal|977;NL|Netherlands|31;NZ|New Zealand|64;NI|Nicaragua|505;NE|Niger|227;" +
    "NG|Nigeria|234;KP|North Korea|850;MK|North Macedonia|389;NO|Norway|47;OM|Oman|968;PK|Pakistan|92;PW|Palau|680;" +
    "PS|Palestine|970;PA|Panama|507;PG|Papua New Guinea|675;PY|Paraguay|595;PE|Peru|51;PH|Philippines|63;PL|Poland|48;" +
    "PT|Portugal|351;QA|Qatar|974;RO|Romania|40;RU|Russia|7;RW|Rwanda|250;KN|Saint Kitts and Nevis|1869;" +
    "LC|Saint Lucia|1758;VC|Saint Vincent and the Grenadines|1784;WS|Samoa|685;SM|San Marino|378;" +
    "ST|São Tomé and Príncipe|239;SA|Saudi Arabia|966;SN|Senegal|221;RS|Serbia|381;SC|Seychelles|248;" +
    "SL|Sierra Leone|232;SG|Singapore|65;SK|Slovakia|421;SI|Slovenia|386;SB|Solomon Islands|677;SO|Somalia|252;" +
    "ZA|South Africa|27;KR|South Korea|82;SS|South Sudan|211;ES|Spain|34;LK|Sri Lanka|94;SD|Sudan|249;SR|Suriname|597;" +
    "SE|Sweden|46;CH|Switzerland|41;SY|Syria|963;TW|Taiwan|886;TJ|Tajikistan|992;TZ|Tanzania|255;TH|Thailand|66;" +
    "TL|Timor-Leste|670;TG|Togo|228;TO|Tonga|676;TT|Trinidad and Tobago|1868;TN|Tunisia|216;TR|Turkey|90;" +
    "TM|Turkmenistan|993;TV|Tuvalu|688;UG|Uganda|256;UA|Ukraine|380;AE|United Arab Emirates|971;GB|United Kingdom|44;" +
    "US|United States|1;UY|Uruguay|598;UZ|Uzbekistan|998;VU|Vanuatu|678;VA|Vatican City|39;VE|Venezuela|58;" +
    "VN|Vietnam|84;YE|Yemen|967;ZM|Zambia|260;ZW|Zimbabwe|263")
    .split(";").map(r => { const [iso, name, dial] = r.split("|"); return { iso, name, dial }; });

  const flag = iso => iso.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  const byIso = new Map(LIST.map(c => [c.iso, c]));
  /* For reading a stored number: the longest code that matches wins
     (+1268 Antigua before +1 USA). Shared codes go to the bigger
     country: +1 USA, +7 Russia, +39 Italy. */
  const PREFERRED = { "1": "US", "7": "RU", "39": "IT" };
  const byDial = [...LIST].sort((a, b) => b.dial.length - a.dial.length);

  function countryOf(number){
    const d = String(number || "").replace(/\D/g, "");
    const hit = byDial.find(c => d.startsWith(c.dial));
    if(!hit) return null;
    return byIso.get(PREFERRED[hit.dial] || hit.iso) || hit;
  }

  function split(number){
    const raw = String(number || "").trim();
    if(!raw) return { country: byIso.get("IN"), local: "" };
    if(!raw.startsWith("+")){
      /* Old numbers were 10 digits with no code: Indian. */
      return { country: byIso.get("IN"), local: raw.replace(/\D/g, "") };
    }
    const c = countryOf(raw) || byIso.get("IN");
    return { country: c, local: raw.replace(/\D/g, "").slice(c.dial.length) };
  }

  function pretty(number){
    const { country, local } = split(number);
    if(!local) return "";
    if(country.iso === "IN" && local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
    return `+${country.dial} ${local}`;
  }

  /* ---------- the picker ----------
     A button with the flag and code; it opens a panel with a search
     box (country name, code or "+971") and the list. Arrow keys move,
     Enter picks, Escape or a tap outside closes. */
  const STYLE = `
.k99-cc-wrap{position:relative;display:flex;flex:none}
.k99-cc{display:flex;align-items:center;gap:5px;height:100%;min-height:46px;padding:0 10px 0 12px;border:1px solid #c9d4d8;border-right:0;border-radius:12px 0 0 12px;background:#f6fbf9;color:#082d38;font:inherit;font-weight:700;font-size:15px;white-space:nowrap;cursor:pointer}
.k99-cc:focus-visible{outline:2px solid #006b5b;outline-offset:1px}
.k99-cc::after{content:"";width:0;height:0;margin-left:2px;border:4px solid transparent;border-top:5px solid #6b7c82;transform:translateY(2px);transition:transform .15s}
.k99-cc[aria-expanded="true"]::after{transform:translateY(-2px) rotate(180deg)}
.k99-cc-flag{font-size:18px;line-height:1}
.k99-cc-panel{position:absolute;left:0;top:calc(100% + 6px);z-index:30;width:min(320px,calc(100vw - 48px));background:#fff;border:1px solid #dfe7e9;border-radius:14px;box-shadow:0 16px 40px rgba(8,45,56,.18);overflow:hidden;text-align:left}
.k99-cc-panel[hidden]{display:none}
.k99-cc-search{position:relative;padding:10px;border-bottom:1px solid #eef2f3}
.k99-cc-search input{width:100%;box-sizing:border-box;height:40px !important;padding:0 12px 0 34px !important;border:1px solid #c9d4d8 !important;border-radius:10px !important;font:inherit;font-size:15px !important;text-align:left !important;background:#fff}
.k99-cc-search input:focus{outline:2px solid #006b5b;outline-offset:0}
.k99-cc-search svg{position:absolute;left:21px;top:50%;width:16px;height:16px;transform:translateY(-50%);color:#6b7c82}
.k99-cc-list{list-style:none;margin:0;padding:4px 0;max-height:240px;overflow-y:auto;overscroll-behavior:contain}
.k99-cc-list li{display:flex;align-items:center;gap:10px;padding:9px 14px;font-size:14px;color:#082d38;cursor:pointer}
.k99-cc-list li .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.k99-cc-list li .d{color:#6b7c82;font-variant-numeric:tabular-nums}
.k99-cc-list li .f{font-size:18px;line-height:1}
.k99-cc-list li.on{background:#eaf7f3}
.k99-cc-list li[aria-selected="true"]{font-weight:700}
.k99-cc-list li[aria-selected="true"] .d{color:#006b5b}
.k99-cc-empty{padding:14px;font-size:14px;color:#6b7c82;text-align:center}`;

  function addStyle(){
    if(document.getElementById("k99-cc-style")) return;
    const s = document.createElement("style");
    s.id = "k99-cc-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let uid = 0;

  function picker(input){
    if(input._cc) return input._cc;
    addStyle();
    const id = "k99cc" + (++uid);
    const wrap = document.createElement("span");
    wrap.className = "k99-cc-wrap";
    wrap.innerHTML = `
<button type="button" class="k99-cc" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" aria-label="Country code">
  <span class="k99-cc-flag"></span><span class="k99-cc-code"></span>
</button>
<div class="k99-cc-panel" hidden>
  <div class="k99-cc-search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>
    <input type="search" placeholder="Search country or code" aria-label="Search country" autocomplete="off" enterkeyhint="search">
  </div>
  <ul class="k99-cc-list" id="${id}-list" role="listbox" aria-label="Countries"></ul>
</div>`;
    input.parentNode.insertBefore(wrap, input);

    const btn = wrap.querySelector(".k99-cc");
    const panel = wrap.querySelector(".k99-cc-panel");
    const search = wrap.querySelector(".k99-cc-search input");
    const list = wrap.querySelector(".k99-cc-list");
    const state = { value: "IN" };
    let shown = [], active = 0;

    function paint(){
      const c = byIso.get(state.value) || byIso.get("IN");
      btn.querySelector(".k99-cc-flag").textContent = flag(c.iso);
      btn.querySelector(".k99-cc-code").textContent = "+" + c.dial;
      btn.setAttribute("aria-label", `Country code: ${c.name} +${c.dial}`);
      const india = c.iso === "IN";
      input.maxLength = india ? 10 : 14;
      input.placeholder = india ? "10-digit mobile number" : "Mobile number";
    }

    function render(){
      const q = norm(search.value.trim()).replace(/^\+/, "");
      shown = !q ? LIST : LIST.filter(c => norm(c.name).includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q);
      /* Names that start with the search first ("in" -> India before Argentina). */
      if(q && !/^\d+$/.test(q)) shown = [...shown].sort((a, b) => (norm(b.name).startsWith(q)) - (norm(a.name).startsWith(q)));
      list.innerHTML = shown.length ? shown.map((c, i) =>
        `<li role="option" id="${id}-${c.iso}" data-iso="${c.iso}" aria-selected="${c.iso === state.value}"${i === active ? ' class="on"' : ""}><span class="f">${flag(c.iso)}</span><span class="n">${c.name}</span><span class="d">+${c.dial}</span></li>`
      ).join("") : `<li class="k99-cc-empty" role="presentation">No country found</li>`;
      if(shown[active]) search.setAttribute("aria-activedescendant", `${id}-${shown[active].iso}`);
    }

    function move(to){
      if(!shown.length) return;
      active = Math.max(0, Math.min(shown.length - 1, to));
      list.querySelectorAll("li.on").forEach(li => li.classList.remove("on"));
      const li = list.children[active];
      if(li){ li.classList.add("on"); li.scrollIntoView({ block: "nearest" }); }
      search.setAttribute("aria-activedescendant", `${id}-${shown[active].iso}`);
    }

    function open(){
      search.value = "";
      active = Math.max(0, LIST.findIndex(c => c.iso === state.value));
      render();
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      move(active);
      search.focus();
      document.addEventListener("pointerdown", outside, true);
    }

    function close(focusBtn){
      if(panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      if(focusBtn) btn.focus();
    }

    function outside(e){ if(!wrap.contains(e.target)) close(false); }

    function choose(iso){
      state.value = iso;
      paint();
      close(false);
      input.focus();
      wrap.dispatchEvent(new Event("change", { bubbles: true }));
    }

    btn.addEventListener("click", () => panel.hidden ? open() : close(true));
    search.addEventListener("input", () => { active = 0; render(); list.scrollTop = 0; });
    search.addEventListener("keydown", e => {
      if(e.key === "ArrowDown"){ e.preventDefault(); move(active + 1); }
      else if(e.key === "ArrowUp"){ e.preventDefault(); move(active - 1); }
      else if(e.key === "Enter"){ e.preventDefault(); if(shown[active]) choose(shown[active].iso); }
      else if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(true); }
      else if(e.key === "Tab") close(false);
    });
    /* Inside a <label>, a click would also "click" the label's first
       control (the button) and close the list again. */
    panel.addEventListener("click", e => { if(e.target !== search) e.preventDefault(); });
    list.addEventListener("click", e => {
      const li = e.target.closest("li[data-iso]");
      if(li) choose(li.dataset.iso);
    });
    list.addEventListener("pointermove", e => {
      const li = e.target.closest("li[data-iso]");
      if(li) move([...list.children].indexOf(li));
    });

    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength); });
    paint();

    input._cc = {
      get value(){ return state.value; },
      set value(iso){ if(byIso.has(iso)){ state.value = iso; paint(); } },
      paint, open, close
    };
    return input._cc;
  }

  function set(input, number){
    const cc = picker(input);
    const { country, local } = split(number);
    cc.value = country.iso;
    input.value = local;
  }

  /* { number: "+<code><digits>" } or { error } ; empty gives { number: "" }. */
  function read(input){
    const cc = picker(input);
    const c = byIso.get(cc.value) || byIso.get("IN");
    const digits = input.value.replace(/\D/g, "").replace(/^0+/, "");
    if(!digits) return { number: "" };
    if(c.iso === "IN" ? !/^[6-9]\d{9}$/.test(digits) : (digits.length < 5 || digits.length + c.dial.length > 15)){
      return { error: c.iso === "IN" ? "Please enter a valid 10-digit mobile number." : "Please enter a valid mobile number." };
    }
    return { number: "+" + c.dial + digits };
  }

  window.Keys99Phone = { picker, set, read, pretty, split, countries: LIST };
})();

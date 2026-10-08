/* =========================================================
   KEYS99 - PHONE NUMBERS WITH A COUNTRY CODE
   window.Keys99Phone, used by the login popup's "Welcome" step
   (js/account.js) and Profile settings (js/profile.js).

   picker(input): puts a country picker before a phone input - the
   flag and code show ("🇮🇳 +91"), a native <select> listing every
   country sits on top (easy on phones), India first by default.
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

  /* ---------- the picker ---------- */
  const STYLE = `
.k99-cc{position:relative;display:flex;align-items:center;gap:4px;flex:none;padding:0 10px 0 12px;border:1px solid #c9d4d8;border-right:0;border-radius:12px 0 0 12px;background:#f6fbf9;color:#082d38;font-weight:700;font-size:15px;white-space:nowrap}
.k99-cc::after{content:"";width:0;height:0;margin-left:2px;border:4px solid transparent;border-top:5px solid #6b7c82;transform:translateY(2px)}
.k99-cc select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px}
.k99-cc:focus-within{outline:2px solid #006b5b;outline-offset:1px}
.k99-cc-flag{font-size:18px;line-height:1}`;

  function addStyle(){
    if(document.getElementById("k99-cc-style")) return;
    const s = document.createElement("style");
    s.id = "k99-cc-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function picker(input){
    if(input._cc) return input._cc;
    addStyle();
    const box = document.createElement("span");
    box.className = "k99-cc";
    box.innerHTML = `<span class="k99-cc-flag"></span><span class="k99-cc-code"></span><select aria-label="Country code" data-native></select>`;
    const select = box.querySelector("select");
    LIST.forEach(c => {
      const o = document.createElement("option");
      o.value = c.iso;
      o.textContent = `${flag(c.iso)} ${c.name} (+${c.dial})`;
      select.appendChild(o);
    });
    const paint = () => {
      const c = byIso.get(select.value) || byIso.get("IN");
      box.querySelector(".k99-cc-flag").textContent = flag(c.iso);
      box.querySelector(".k99-cc-code").textContent = "+" + c.dial;
      const india = c.iso === "IN";
      input.maxLength = india ? 10 : 14;
      input.placeholder = india ? "10-digit mobile number" : "Mobile number";
    };
    select.value = "IN";
    select.addEventListener("change", () => { paint(); input.focus(); });
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, input.maxLength); });
    input.parentNode.insertBefore(box, input);
    paint();
    input._cc = { select, paint };
    return input._cc;
  }

  function set(input, number){
    const cc = picker(input);
    const { country, local } = split(number);
    cc.select.value = country.iso;
    cc.paint();
    input.value = local;
  }

  /* { number: "+<code><digits>" } or { error } ; empty gives { number: "" }. */
  function read(input){
    const cc = picker(input);
    const c = byIso.get(cc.select.value) || byIso.get("IN");
    const digits = input.value.replace(/\D/g, "").replace(/^0+/, "");
    if(!digits) return { number: "" };
    if(c.iso === "IN" ? !/^[6-9]\d{9}$/.test(digits) : (digits.length < 5 || digits.length + c.dial.length > 15)){
      return { error: c.iso === "IN" ? "Please enter a valid 10-digit mobile number." : "Please enter a valid mobile number." };
    }
    return { number: "+" + c.dial + digits };
  }

  window.Keys99Phone = { picker, set, read, pretty, split, countries: LIST };
})();

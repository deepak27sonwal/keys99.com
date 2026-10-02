/* =========================================================
   KEYS99 - HOMEPAGE PRE-RENDER

   Writes New Launch, Popular, Top Cities and Top Localities,
   plus the stats bar and property-type counts, into index.html
   so crawlers see real projects and links without running
   JavaScript.

   The card markup is not duplicated here: the homepage's own
   top-level functions (mapResidentialProject, createPropertyCard,
   cityCardHtml, ...) are read out of index.html with acorn and run
   in a sandbox, so the built HTML is exactly what the page renders
   live. Only function declarations and constants with plain
   literal values are taken - nothing that touches the DOM runs.
========================================================= */

const fs = require("fs");
const vm = require("vm");
const acorn = require("acorn");
const cheerio = require("cheerio");

const EXPORTS = [
  "mapResidentialProject", "createPropertyCard", "cityCardHtml", "localityChipHtml",
  "computeTopCities", "computeTopLocalities", "computeSiteStats",
  "formatStatCount", "typeCountText",
  "POPULAR_COUNT", "NEW_LAUNCH_COUNT", "TOP_CITY_COUNT", "TOP_LOCALITY_COUNT",
  "slugify", "titleCaseName", "formatPrice", "getNumericPrice", "getBhkOptions",
  "normaliseBhkType", "escapeHtml"
];

/* A constant is safe to evaluate when its value is built only from
   literals - no identifiers, calls or member access. */
function isPlainValue(node){
  if(!node) return false;
  switch(node.type){
    case "Literal": return true;
    case "TemplateLiteral": return node.expressions.length === 0;
    case "UnaryExpression": return isPlainValue(node.argument);
    case "BinaryExpression": return isPlainValue(node.left) && isPlainValue(node.right);
    case "ArrayExpression": return node.elements.every(isPlainValue);
    case "ObjectExpression":
      return node.properties.every(p => p.type === "Property" && !p.computed && isPlainValue(p.value));
    default: return false;
  }
}

function loadHomepageFunctions(html, supabaseUrl){
  const $ = cheerio.load(html);
  const pieces = [];

  $("script:not([src])").each((_, el) => {
    const type = $(el).attr("type");
    if(type && type !== "text/javascript" && type !== "module") return;
    const code = $(el).html();
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
    ast.body.forEach(node => {
      if(node.type === "FunctionDeclaration"){
        pieces.push(code.slice(node.start, node.end));
      }else if(node.type === "VariableDeclaration" && node.declarations.every(d => isPlainValue(d.init))){
        pieces.push(code.slice(node.start, node.end));
      }
    });
  });

  const context = vm.createContext({ SUPABASE_URL: supabaseUrl, console });
  const exportList = EXPORTS.map(name => `${name}: typeof ${name} === "undefined" ? undefined : ${name}`).join(", ");
  const api = vm.runInContext(pieces.join("\n\n") + `\n;({ ${exportList} })`, context);

  const missing = EXPORTS.filter(name => api[name] === undefined);
  if(missing.length) throw new Error("index.html no longer defines: " + missing.join(", "));
  return api;
}

function replaceBetween(html, key, content){
  const re = new RegExp(`(<!--keys99:${key}:start-->)[\\s\\S]*?(<!--keys99:${key}:end-->)`);
  if(!re.test(html)) throw new Error(`index.html is missing the keys99:${key} markers`);
  return html.replace(re, (_, start, end) => `${start}${content}\n  ${end}`);
}

function buildHomepage(indexPath, rows, supabaseUrl){
  let html = fs.readFileSync(indexPath, "utf8");
  const H = loadHomepageFunctions(html, supabaseUrl);

  /* Same order and filters as the live page: newest published first. */
  const props = rows.map(row => H.mapResidentialProject(row));

  html = replaceBetween(html, "newlaunches",
    props.filter(p => p.is_new_launch).slice(0, H.NEW_LAUNCH_COUNT)
      .map(p => H.createPropertyCard(p, "New Launch", "st-new-launch")).join(""));
  html = replaceBetween(html, "popular",
    props.slice(0, H.POPULAR_COUNT).map(p => H.createPropertyCard(p)).join(""));
  html = replaceBetween(html, "cities",
    H.computeTopCities(props, H.TOP_CITY_COUNT).map(H.cityCardHtml).join(""));
  html = replaceBetween(html, "localities",
    H.computeTopLocalities(props, H.TOP_LOCALITY_COUNT).map(H.localityChipHtml).join(""));

  /* Numbers: only the text of the marked elements changes. */
  const stats = H.computeSiteStats(props);
  html = html.replace(/(<strong data-stat="(\w+)">)[^<]*(<\/strong>)/g,
    (_, open, key, close) => open + H.formatStatCount(stats[key]) + close);
  html = html.replace(/(<p data-type-count="(\w+)">)[^<]*(<\/p>)/g,
    (_, open, key, close) => open + H.typeCountText(stats.types[key]) + close);

  fs.writeFileSync(indexPath, html);
  return { projects: props.length, stats };
}

module.exports = { buildHomepage, loadHomepageFunctions };

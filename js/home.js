/* =========================================================
   KEYS99 - HOMEPAGE SCRIPT
   Moved out of index.html so browsers cache it between visits
   instead of downloading it inside every copy of the page.
   Loaded with defer, first of the page's scripts, so it still runs
   before the others and before DOMContentLoaded, as the inline
   script did. build/homepage.js reads its functions and constants
   to pre-render the homepage, hub and search pages.
========================================================= */

/* =========================================================
   FETCH HELPERS
========================================================= */

async function fetchAllProperties(){

  /* Only published, non-deleted projects. The database's RLS
     policies enforce the same rule for anonymous visitors; the
     filters here keep signed-in admins from seeing drafts on the
     public homepage too. */
  const published = (table, select) => supabasePublic
    .from(table)
    .select(select)
    .eq("moderation_status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending:false, nullsFirst:false });

  const [homes, commercial] = await Promise.all([
    published(PROJECTS_TABLE, PROJECT_SELECT),
    typeof COMMERCIAL_TABLE === "string" ? published(COMMERCIAL_TABLE, COMMERCIAL_SELECT) : Promise.resolve({ data: [] })
  ]);

  if(homes.error){
    console.error("Supabase error:", homes.error);
    throw homes.error;
  }
  /* Commercial is extra: if it fails, the homes still show. */
  if(commercial.error) console.error("Supabase error (commercial):", commercial.error);

  return mergeByNewest(
    (homes.data || []).map(mapResidentialProject),
    (!commercial.error && commercial.data || []).map(mapCommercialProject)
  );

}


/* =========================================================
   RESIDENTIAL PROJECT -> CARD SHAPE

   The database splits a project across residential_projects,
   developers, cities, localities, residential_configurations
   and residential_media. The card code below was written for
   one flat row, so each project is flattened into that shape
   here and nothing else on the page needs to know.
========================================================= */

const STATUS_LABELS = {
  upcoming:"Upcoming",
  new_launch:"New Launch",
  under_construction:"Under Construction",
  ready_to_move:"Ready to Move",
  completed:"Completed",
  resale:"Resale"
};

const PROJECT_TYPE_LABELS = {
  apartment:"Apartment",
  villa:"Villa",
  row_house:"Row House",
  townhouse:"Townhouse",
  residential_plot:"Residential Plot",
  independent_house:"Independent House",
  mixed_residential:"Residential Project",
  other:"Property"
};

const PROJECT_TYPE_CATEGORY = {
  villa:"luxury",
  row_house:"luxury",
  townhouse:"luxury",
  independent_house:"luxury",
  residential_plot:"plots"
};

const AVAILABILITY_LABELS = {
  available:"Available",
  sold_out:"Sold Out",
  leased_out:"Leased Out",
  on_request:"On Request"
};

const COMMERCIAL_TYPE_LABELS = {
  office:"Office Space",
  shop:"Shop",
  showroom:"Showroom",
  warehouse:"Warehouse",
  industrial:"Industrial Space",
  healthcare:"Healthcare Space",
  education:"Education Space",
  hospitality:"Hospitality Space",
  commercial_land:"Commercial Land",
  commercial_building:"Commercial Building"
};

function storagePublicUrl(bucket, path){
  if(!bucket || !path) return "";
  return SUPABASE_URL + "/storage/v1/object/public/" + bucket + "/" +
    String(path).split("/").map(encodeURIComponent).join("/");
}

function mediaUrl(item){
  return (item && (item.media_url || storagePublicUrl(item.storage_bucket, item.media_path))) || "";
}

function pickMainImage(row){
  const media = (Array.isArray(row.media) ? row.media : [])
    .filter(item => item && item.is_active !== false)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const main =
    media.find(item => item.media_type === "main_image" && item.is_primary) ||
    media.find(item => item.media_type === "main_image") ||
    media.find(item => item.media_type === "gallery" && item.is_primary) ||
    media.find(item => item.media_type === "gallery");

  return mediaUrl(main) || storagePublicUrl(row.main_image_bucket, row.main_image_path);
}

function formatMonthYear(value){
  if(!value) return "";
  const date = new Date(value);
  if(!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { month:"short", year:"numeric" });
}

function mapConfiguration(config, projectPriceOnRequest){
  const onRequest = projectPriceOnRequest || config.price_on_request;
  const from = Number(config.starting_price);
  const to = Number(config.maximum_price);
  const hasFrom = Number.isFinite(from) && from > 0;
  const hasRange = hasFrom && Number.isFinite(to) && to > from;

  /* A price entered per sq ft / sq m is a rate, not the flat's price:
     it is shown as a rate and kept out of totals, sorting and filters. */
  const unit = config.price_type === "price_per_sq_ft" ? " / Sq.Ft"
    : config.price_type === "price_per_sq_m" ? " / Sq.M" : "";
  const unitPrice = unit && !onRequest && hasFrom ? from : null;

  return {
    type: normaliseBhkType(config.bhk_type),
    price: onRequest || !hasFrom || unit ? null : from,
    unitPrice,
    unit,
    price_words: onRequest ? "On Request"
      : unitPrice !== null ? (hasRange ? "₹ " + from.toLocaleString("en-IN") + " – " + to.toLocaleString("en-IN") + unit : formatUnitPrice(from, unit))
      : (hasRange ? formatPrice(from) + " – " + formatPrice(to) : ""),
    sqft: config.carpet_area,
    areaUnit: config.area_unit === "sq_m" ? "Sq.M" : "Sq.Ft",
    priceType: config.price_type || "total_price",
    availability: AVAILABILITY_LABELS[config.availability] || ""
  };
}

function mapResidentialProject(row){
  const configs = (Array.isArray(row.configurations) ? row.configurations : [])
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  /* The badge shows the project's own status. "New launch" can be
     marked either as the status or as the construction stage; both
     put the project in the New Launch section. */
  const statusKey = row.status;

  return {
    id: row.id,
    slug: row.slug,
    project_name: titleCaseName(row.project_name),
    project_type: row.project_type,
    type_label: PROJECT_TYPE_LABELS[row.project_type] || "Property",
    category: PROJECT_TYPE_CATEGORY[row.project_type] || "residential",
    is_new_launch: row.status === "new_launch" || row.construction_stage === "new_launch",
    /* Resale can be marked as the status or the construction stage. */
    is_resale: row.status === "resale" || row.construction_stage === "resale",
    status_key: statusKey,

    /* Developers are only readable when active and verified, so an
       unverified developer comes back null and the card omits it. */
    developer: row.developer ? row.developer.name : "",
    developer_logo: row.developer && /^https?:\/\//i.test(row.developer.logo_url || "") ? row.developer.logo_url : "",
    city: row.city ? row.city.name : "",
    state: row.city ? row.city.state : "",
    /* Photo for the city card (cities.city_image), if one is set. */
    city_image: row.city && /^https?:\/\//i.test(row.city.city_image || "") ? row.city.city_image : "",
    locality: row.locality ? row.locality.name : "",
    address: row.address,
    pincode: row.pincode,

    status: STATUS_LABELS[statusKey] || "",
    possession: formatMonthYear(row.target_possession_date || row.rera_possession_date),
    overview: row.overview,
    rera_id: row.rera_number,

    main_image: pickMainImage(row),
    bhk_options: configs.map(config => mapConfiguration(config, row.price_on_request)),

    views: row.view_count,
    created_at: row.published_at || row.created_at
  };
}


/* =========================================================
   COMMERCIAL PROJECT -> THE SAME CARD SHAPE
   Units (Office Space, Shop...) fill the card's configuration
   chips. A unit quoted as a monthly rent shows "/ month" and, like
   a per-sq-ft rate, stays out of price totals and filters.
========================================================= */

function mapCommercialProject(row){
  const units = (Array.isArray(row.units) ? row.units : [])
    .slice()
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    .map(unit => {
      const rentOnly = unit.price_type === "monthly_rent" || (!(Number(unit.starting_price) > 0) && Number(unit.expected_rent) > 0);
      const option = mapConfiguration({
        bhk_type: unit.unit_type,
        carpet_area: unit.carpet_area,
        area_unit: unit.area_unit,
        starting_price: rentOnly && unit.price_type !== "monthly_rent" ? unit.expected_rent : unit.starting_price,
        maximum_price: rentOnly && unit.price_type !== "monthly_rent" ? null : unit.maximum_price,
        price_type: rentOnly ? "price_per_sq_ft" : unit.price_type,
        price_on_request: unit.price_on_request,
        availability: unit.availability
      }, row.price_on_request);
      if(rentOnly){
        option.unit = " / month";
        if(option.unitPrice !== null) option.price_words = formatUnitPrice(option.unitPrice, option.unit);
        option.priceType = "monthly_rent";
      }
      return option;
    });

  return {
    id: row.id,
    slug: row.slug,
    kind: "commercial",
    base: "commercial",
    project_name: titleCaseName(row.project_name),
    project_type: row.project_type,
    type_label: COMMERCIAL_TYPE_LABELS[row.project_type] || "Commercial",
    category: "commercial",
    transaction: row.transaction_type || "",
    is_new_launch: row.status === "new_launch",
    is_resale: row.status === "resale",
    status_key: row.status,

    developer: row.developer ? row.developer.name : "",
    developer_logo: row.developer && /^https?:\/\//i.test(row.developer.logo_url || "") ? row.developer.logo_url : "",
    city: row.city ? row.city.name : "",
    state: row.city ? row.city.state : "",
    city_image: row.city && /^https?:\/\//i.test(row.city.city_image || "") ? row.city.city_image : "",
    locality: row.locality ? row.locality.name : "",
    address: row.address,
    pincode: row.pincode,

    status: STATUS_LABELS[row.status] || "",
    possession: "",
    overview: row.overview,
    rera_id: row.rera_number,

    main_image: pickMainImage(row),
    bhk_options: units,

    views: row.view_count,
    created_at: row.published_at || row.created_at
  };
}

/* Two lists of cards, newest first, as one list. */
function mergeByNewest(a, b){
  const time = p => new Date(p.created_at || 0).getTime() || 0;
  return a.concat(b).sort((x, y) => time(y) - time(x));
}


/* =========================================================
   BHK / OPTION HELPERS
========================================================= */

function getBhkOptions(property){
  if(!property || !Array.isArray(property.bhk_options)){
    return [];
  }
  return property.bhk_options.filter(option => option && typeof option === "object");
}

function getPropertyTypes(property){
  const options = getBhkOptions(property);
  return options.map(option => String(option.type || "").trim()).filter(Boolean);
}

function getBhkText(property){
  const types = getPropertyTypes(property).map(normaliseBhkType).filter(Boolean);
  if(!types.length){
    return "";
  }
  const uniqueTypes = [...new Set(types)];
  return uniqueTypes.join(" / ");
}


/* Card title, e.g. "1 BHK / 2 BHK Apartment" */

const CATEGORY_LABELS = {
  residential:"Apartment",
  luxury:"Residence",
  commercial:"Commercial Space",
  plots:"Plot"
};

/* Listing fields are free text, so the same thing arrives spelled
   several ways - "DIGHI", "lodha", "2 bhk", "3BhK", "2bhk". Since
   these are now real headings in the HTML rather than something
   JavaScript paints in later, search engines read them exactly as
   stored. Normalise for display only; the stored values, and the
   slugs built from them, are untouched.

   Kept identical to titleCase() in build/seo.js, including leaving
   short all-caps words like DLF and RERA alone. */
function titleCaseName(value){
  return String(value == null ? "" : value)
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(word => word.length <= 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/* "2 bhk", "2BHK" and "3BhK" all mean one thing. Normalising before
   the de-duplication in getBhkText also collapses titles that used
   to read "2 bhk / 2 BHK Apartment". */
function normaliseBhkType(value){
  const text = String(value == null ? "" : value).trim();
  if(!text) return "";

  const bhk = text.match(/^(\d+(?:\.\d+)?)\s*bhk$/i);
  if(bhk) return bhk[1] + " BHK";

  return titleCaseName(text);
}

function getCardTitle(property){
  /* Projects have a real name; prefer it over a generated
     "2 BHK Apartment" label. */
  if(property.project_name){
    return property.project_name;
  }

  const bhk = getBhkText(property);
  const category = getCategory(property);
  const label = CATEGORY_LABELS[category] || "Property";

  if(!bhk){
    return label;
  }

  return bhk + " " + label;
}


/* =========================================================
   PRICE HELPERS
========================================================= */

function getNumericPrice(option){
  if(!option){
    return null;
  }
  const price = Number(option.price);
  if(Number.isFinite(price) && price > 0){
    return price;
  }
  return null;
}

/* "₹ 7,000 / Sq.Ft" - rates are shown in full, not as "₹ 7K". */
function formatUnitPrice(value, unit){
  return "₹ " + Number(value).toLocaleString("en-IN") + unit;
}

function formatPrice(price){

  if(price === null || price === undefined || !Number.isFinite(Number(price))){
    return "";
  }

  price = Number(price);

  if(price >= 10000000){
    const crore = price / 10000000;
    return "₹ " + crore.toFixed(crore % 1 === 0 ? 0 : 2).replace(/\.00$/, "") + " Cr";
  }

  if(price >= 100000){
    const lakh = price / 100000;
    return "₹ " + lakh.toFixed(lakh % 1 === 0 ? 0 : 2).replace(/\.00$/, "") + " Lakh";
  }

  if(price >= 1000){
    const thousand = price / 1000;
    return "₹ " + thousand.toFixed(thousand % 1 === 0 ? 0 : 1).replace(/\.0$/, "") + "K";
  }

  return "₹ " + price.toLocaleString("en-IN");

}

function getOptionPriceText(option){
  const words = String((option && option.price_words) || "").trim();
  if(words){
    return words;
  }
  const numeric = getNumericPrice(option);
  if(numeric === null){
    return "On Request";
  }
  return formatPrice(numeric);
}


/* =========================================================
   AREA HELPERS
========================================================= */

function getOptionAreaText(option){
  const value = parseFloat(option && option.sqft);
  if(!Number.isFinite(value)){
    return "—";
  }
  const unit = (option && option.areaUnit) || "Sq.Ft";
  return Number(value).toLocaleString("en-IN") + " " + unit;
}

/* Per-config availability (Available / Limited / Sold Out).
   Reads option.availability or option.status if the data
   provides it, otherwise defaults to "Available". */

function getOptionAvailabilityText(option){
  const raw = String((option && (option.availability || option.status)) || "").trim();
  return raw || "Available";
}

function getOptionAvailabilityClass(text){
  const value = String(text || "").toLowerCase();
  if(value.includes("sold")){
    return "sold";
  }
  if(value.includes("limited")){
    return "limited";
  }
  return "available";
}


/* =========================================================
   LOCATION / STATUS / CATEGORY
========================================================= */

function getLocationText(property){

  const parts = [property.locality, property.city, property.state];

  /* Title-cased before the de-duplication, so "Pune" and "PUNE"
     collapse to one entry instead of both being printed. */
  const unique = parts
    .map(value => titleCaseName(value))
    .filter(Boolean)
    .filter((value,index,array) => array.indexOf(value) === index);

  if(unique.length){
    return unique.join(", ");
  }

  if(property.address){
    return property.address;
  }

  return "Location not available";

}

function getStatusText(property){
  const status = String(property.status || "").trim();
  return status || "Available";
}

/* One colour per project status - see .badge.st-* in css/index.css. */
function getStatusClass(status, property){
  if(property && property.status_key){
    return "st-" + String(property.status_key).replace(/_/g, "-");
  }

  const value = String(status || "").toLowerCase();
  if(value.includes("rent") || value.includes("lease")){
    return "rent";
  }
  if(value.includes("sold") || value.includes("closed")){
    return "sold";
  }
  return "sale";
}

function getCategory(property){

  /* Set from project_type when the row came from residential_projects. */
  if(property.category){
    return property.category;
  }

  /* Only scan curated fields (bhk config, developer, overview) - never
     address/locality/city. Indian addresses routinely read "Plot 12,
     Powai" or "Plot No. 4, Sector 5" as a house/lot number, which would
     otherwise false-positive a plain residential apartment as "plots". */

  const text = [
    ...getPropertyTypes(property),
    property.developer || "",
    property.overview || ""
  ].join(" ").toLowerCase();

  if(text.includes("luxury") || text.includes("penthouse") || text.includes("villa") || text.includes("premium") || text.includes("bungalow")){
    return "luxury";
  }

  if(text.includes("commercial") || text.includes("office") || text.includes("shop") || text.includes("warehouse") || text.includes("showroom") || text.includes("retail")){
    return "commercial";
  }

  if(text.includes("plot") || text.includes("farmland") || text.includes("farm land") || text.includes("agricultural land")){
    return "plots";
  }

  return "residential";

}

function getSearchText(property){
  return [
    getCardTitle(property),
    property.developer,
    property.address,
    property.state,
    property.city,
    property.locality,
    property.pincode,
    property.status,
    property.overview,
    property.rera_id,
    property.posted_by_name,
    property.posted_by_user_code,
    ...getPropertyTypes(property),
    ...getBhkOptions(property).map(option => option.price_words || "")
  ].filter(Boolean).join(" ").toLowerCase();
}

function getImageUrl(property){
  const image = String(property.main_image || "").trim();
  if(image){
    return image;
  }
  return "assets/property-placeholder.svg";
}

/* Cards show a small WebP copy of the main photo that the build
   makes (build/thumbs.js) instead of the full upload, which is
   often 1-2 MB. The file name is a hash of the photo's URL, so the
   page can work it out without a lookup. A project added since the
   last build has no thumbnail yet: the img's onerror then loads the
   original photo from data-full. */
const THUMB_DIR = "assets/thumbs/";

function thumbName(url){
  let hash = 0x811c9dc5;                       // 32-bit FNV-1a
  for(let i = 0; i < url.length; i++){
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0") + ".webp";
}

function getCardImage(property){
  const full = getImageUrl(property);
  return /^https?:\/\//i.test(full)
    ? { src: THUMB_DIR + thumbName(full), full }
    : { src: full, full: "" };
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   SEO URLS

   The generated pages are the indexable ones:
     projects/<slug>/                  a listing
     projects/<city>/                  a city hub
     projects/<city>/<locality>/       a locality page

   projects/property-details.html is noindex AND Disallowed
   in robots.txt, so linking cards there sends crawlers to a
   dead end and the generated pages stay orphaned. Every link
   below points at the generated URL instead, and only falls
   back to ?id= when a row has no slug yet.

   slugify must stay identical to the one in build/seo.js -
   if the two ever drift, these links point at pages the
   build never wrote.
========================================================= */

function slugify(value){
  return String(value == null ? "" : value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function propertyUrl(property){
  /* Homes live under projects/, commercial projects under commercial/. */
  const base = (property && property.base) || "projects";
  const slug = slugify(property && property.slug);
  if(slug){
    return base + "/" + slug + "/";
  }
  /* ".html" spelled out: hosts differ on whether an extensionless
     address finds the file (Cloudflare redirects it away anyway). */
  return base + "/property-details.html?id=" + encodeURIComponent(property && property.id);
}

function cityUrl(city, base){
  const slug = slugify(city);
  return slug ? (base || "projects") + "/" + slug + "/" : "projects/search";
}

function localityUrl(city, locality, base){
  const citySlug = slugify(city);
  const localitySlug = slugify(locality);
  if(citySlug && localitySlug){
    return (base || "projects") + "/" + citySlug + "/" + localitySlug + "/";
  }
  return "projects/search";
}


/* =========================================================
   CREATE PROPERTY CARD
   badgeLabel / badgeClass let a section (e.g. New Launches)
   override the default status badge.
========================================================= */

function createPropertyCard(property, badgeLabel, badgeClass){

  const id = escapeHtml(property.id);
  const title = getCardTitle(property);
  const location = getLocationText(property);

  const developer = titleCaseName(property.developer);

  const status = badgeLabel || getStatusText(property);
  const statusClass = badgeClass || getStatusClass(getStatusText(property), property);

  const category = getCategory(property);

  const image = getCardImage(property);
  const imageAlt = title + " " + location;

  const searchText = getSearchText(property);

  const options = getBhkOptions(property);

  /* Lowest numeric price across configurations, shown above the
     BHK rows. Cards with no configuration already say "Price on
     Request" in their single row, so they skip this line. */
  const optionPrices = options.map(getNumericPrice).filter(price => price !== null);
  /* Only per-sq-ft rates given: show the lowest rate instead. */
  const rateOptions = options.filter(option => option.unitPrice);
  const lowestRate = rateOptions.length
    ? rateOptions.reduce((a, b) => (b.unit === a.unit && b.unitPrice < a.unitPrice ? b : a))
    : null;
  const startingPriceHtml = !options.length ? "" : optionPrices.length
    ? `<p class="card-price"><span>Starting from</span> <strong>${escapeHtml(formatPrice(Math.min(...optionPrices)))}</strong></p>`
    : lowestRate
      ? `<p class="card-price"><span>Starting from</span> <strong>${escapeHtml(formatUnitPrice(lowestRate.unitPrice, lowestRate.unit))}</strong></p>`
      : `<p class="card-price"><strong>Price on Request</strong></p>`;

  const firstOption = options[0];
  const bhkValue = firstOption && firstOption.type ? String(firstOption.type).toLowerCase() : "";

  const bhkChips = options.length
    ? options.map(option => {

        const availabilityText = getOptionAvailabilityText(option);
        const availabilityClass = getOptionAvailabilityClass(availabilityText);

        return `
        <div class="bhk-chip">
          <div class="bhk-stat">
            <span>${property.kind === "commercial" ? "Unit" : "Config"}</span>
            <strong>${escapeHtml(option.type || "—")}</strong>
          </div>
          <div class="bhk-stat">
            <span>Carpet Area</span>
            <strong>${escapeHtml(getOptionAreaText(option))}</strong>
          </div>
          <div class="bhk-stat price-stat">
            <span>Price</span>
            <strong>${escapeHtml(getOptionPriceText(option))}</strong>
          </div>
          <div class="bhk-stat status-stat status-${availabilityClass}">
            <span>Status</span>
            <strong>${escapeHtml(availabilityText)}</strong>
          </div>
        </div>
      `;
      }).join("")
    : `
        <div class="bhk-chip">
          <div class="bhk-stat price-stat">
            <strong>Price on Request</strong>
            <span>Contact for details</span>
          </div>
        </div>
      `;

  return `

    <article
      class="property-card"
      data-id="${id}"
      data-url="${escapeHtml(propertyUrl(property))}"
      data-search="${escapeHtml(searchText)}"
      data-type="${escapeHtml(category)}"
      data-bhk="${escapeHtml(bhkValue)}"
      data-bhks="${escapeHtml(options.map(o => normaliseBhkType(o.type).toLowerCase()).filter(Boolean).join("|"))}"
      data-city="${escapeHtml(slugify(property.city))}"
      data-locality="${escapeHtml(slugify(property.locality))}"
      data-developer="${escapeHtml(slugify(titleCaseName(property.developer)))}"
      data-price="${optionPrices.length ? Math.min(...optionPrices) : ""}"
      data-status="${escapeHtml(property.status_key || "")}"
      data-listing="${property.is_resale ? "resale" : "new"}"
      data-deal="${escapeHtml(property.transaction || "sale")}"
      data-created="${escapeHtml(property.created_at || "")}"
    >

      <div class="property-image">

        <img
          src="${escapeHtml(image.src)}"
          ${image.full ? `data-full="${escapeHtml(image.full)}"` : ""}
          alt="${escapeHtml(imageAlt)}"
          loading="lazy"
          decoding="async"
          width="400"
          height="300"
          onerror="if(this.dataset.full){this.src=this.dataset.full;this.dataset.full=''}else{this.onerror=null;this.src='assets/property-placeholder.svg'}"
        >

        <span class="badge ${statusClass}">${escapeHtml(status)}</span>

        <button class="fav" aria-label="Save this project" data-property-id="${id}"${property.kind === "commercial" ? ` data-kind="commercial"` : ""} type="button">♡</button>

        ${slugify(property.slug) ? `<button class="compare-toggle" type="button" aria-pressed="false" data-compare-slug="${escapeHtml(slugify(property.slug))}" data-compare-name="${escapeHtml(title)}"${property.kind === "commercial" ? ` data-compare-kind="commercial"` : ""}>⇄ Compare</button>` : ""}

      </div>


      <div class="property-body">

        <div class="card-title-row">
          <h3><a class="card-link" href="${escapeHtml(propertyUrl(property))}">${escapeHtml(title)}</a></h3>
          ${property.rera_id ? `<span class="rera-badge" title="RERA registered">✓ RERA</span>` : ""}
        </div>

        <p class="location">⌖ &nbsp; ${escapeHtml(location)}</p>

        ${developer ? `<p class="developer">By &nbsp; ${escapeHtml(developer)}</p>` : ""}


        <div class="card-bottom">
        ${startingPriceHtml}
        <div class="bhk-wrap${options.length > 1 ? " has-more" : ""}">
          <div class="bhk-scroll">
            ${bhkChips}
          </div>
          ${options.length > 1 ? `<span class="bhk-count" aria-hidden="true">1/${options.length} ↕</span>
          <span class="bhk-track" aria-hidden="true"><span class="bhk-thumb"></span></span>` : ""}
        </div>
        </div>

      </div>

    </article>

  `;

}


/* =========================================================
   ATTACH CARD EVENTS (view details)
   Accepts a root element so it can be reused for every
   property grid on the page.
========================================================= */

/* =========================================================
   BHK ROWS: show one configuration at a time
   Each card shows a single BHK row; the rest scroll vertically,
   one row per swipe. Row height changes with screen size, so the
   box is sized from its first row rather than a fixed CSS value.
========================================================= */

function fitBhkScrolls(root){
  (root || document).querySelectorAll(".bhk-scroll").forEach(scroll => {
    const first = scroll.firstElementChild;
    if(!first) return;
    scroll.style.maxHeight = first.offsetHeight + "px";

    const wrap = scroll.parentElement;
    const count = wrap.querySelector(".bhk-count");
    const thumb = wrap.querySelector(".bhk-thumb");
    if(!count) return;

    /* The scroller: a thin track beside the row whose thumb shows
       how much there is and where you are - phones hide native
       scrollbars, so this is drawn by hand. */
    const total = scroll.children.length;
    const update = () => {
      const max = scroll.scrollHeight - scroll.clientHeight;
      const ratio = max > 0 ? scroll.scrollTop / max : 0;
      const step = first.offsetHeight + (parseFloat(getComputedStyle(scroll).rowGap) || 0);
      const index = Math.min(total, Math.round(scroll.scrollTop / step) + 1);
      count.textContent = `${index}/${total} ↕`;
      if(thumb){
        const track = thumb.parentElement.clientHeight;
        const size = Math.max(10, track / total);
        thumb.style.height = size + "px";
        thumb.style.transform = `translateY(${ratio * (track - size)}px)`;
      }
      wrap.classList.toggle("at-end", ratio >= 0.99);
    };
    update();

    if(scroll._bhkBound) return;
    scroll._bhkBound = true;
    scroll.addEventListener("scroll", update, { passive:true });
  });
}

let bhkResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(bhkResizeTimer);
  bhkResizeTimer = setTimeout(() => fitBhkScrolls(document), 150);
});

function attachPropertyEvents(root){

  root = root || document;

  fitBhkScrolls(root);

  /* The save hearts are handled by js/account.js. */

  root.querySelectorAll(".property-card").forEach(card => {

    card.style.cursor = "pointer";

    card.addEventListener("click", event => {

      /* The title is a real link now, so let the browser handle
         its own clicks - otherwise ctrl/cmd-click and "open in
         new tab" would be swallowed by this handler. */
      if(event.target.closest("a")){
        return;
      }

      const url = card.dataset.url;
      if(url){
        window.location.href = url;
      }
    });

  });

}


/* =========================================================
   QUERY STRING HELPERS
========================================================= */

function buildSearchUrl(params){

  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    const text = String(value ?? "").trim();
    if(text){
      query.set(key, text);
    }
  });

  const queryString = query.toString();

  return "projects/search" + (queryString ? "?" + queryString : "");

}

/* Everything the hero search bar and its filter panel hold. */
function heroSearchParams(){
  const value = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  return {
    q: value("searchInput"),
    type: value("propertyType"),
    bhk: value("bhkType"),
    city: value("heroCity"),
    locality: value("heroLocality"),
    developer: value("heroDeveloper"),
    status: value("heroStatus"),
    minPrice: value("heroMinPrice"),
    maxPrice: value("heroMaxPrice"),
    sort: value("heroSort")
  };
}

function goToSearch(params){
  window.location.href = buildSearchUrl(params);
}


/* =========================================================
   SHARED UI: MOBILE MENU / LOGIN / BOTTOM NAV
========================================================= */

function initMobileMenu(){

  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if(!menuBtn || !mobileMenu){
    return;
  }

  menuBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
    menuBtn.textContent = mobileMenu.classList.contains("open") ? "×" : "☰";
  });

  mobileMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      menuBtn.textContent = "☰";
    });
  });

}

function initLoginButton(){

  const loginBtn = document.getElementById("loginBtn");

  if(loginBtn){
    loginBtn.addEventListener("click", () => {
      window.location.href = "saved";
    });
  }

}

function initBottomNav(activeTarget){

  const bottomNav = document.getElementById("bottomNav");

  if(!bottomNav){
    return;
  }

  bottomNav.querySelectorAll("button").forEach(btn => {
    btn.classList.toggle("bn-active", btn.dataset.target === activeTarget);
  });

  bottomNav.addEventListener("click", event => {

    const button = event.target.closest("button");

    if(!button){
      return;
    }

    const target = button.dataset.target;

    if(target === "home"){

      if(location.pathname.endsWith("index.html") || location.pathname === "/" || location.pathname.endsWith("/")){
        window.scrollTo({ top:0, behavior:"smooth" });
      }else{
        window.location.href = "./";
      }

    }else if(target === "search"){

      window.location.href = "projects/search";

    }else if(target === "reels"){

      window.location.href = "reels";

    }else if(target === "profile"){

      window.location.href = "profile";

    }else if(target === "saved"){

      window.location.href = "saved";

    }

  });

}


/* =========================================================
   KEYS99 - HOMEPAGE (index.html)
   Renders Popular / New Launches / Top Cities / Top
   Localities, then routes clicks on city cards, locality
   chips and property-type cards to projects/search.html with the
   right filters pre-applied via query string.
========================================================= */

let allProperties = [];
const NEW_LAUNCH_COUNT = 8;
const POPULAR_COUNT = 8;
const TOP_CITY_COUNT = 5;
const TOP_LOCALITY_COUNT = 10;
const TOP_DEVELOPER_COUNT = 8;


/* DOM ELEMENTS */

const propertyList = document.getElementById("propertyList");
const propertyLoading = document.getElementById("propertyLoading");
const propertyError = document.getElementById("propertyError");
const propertyEmpty = document.getElementById("propertyEmpty");
const propertyScrollHint = document.getElementById("propertyScrollHint");
const viewAllBtn = document.getElementById("viewAllBtn");

const newLaunchesList = document.getElementById("newLaunchesList");
const newLaunchesState = document.getElementById("newLaunchesState");
const newLaunchesHint = document.getElementById("newLaunchesHint");
const newLaunchesViewAllBtn = document.getElementById("newLaunchesViewAllBtn");

const recentlyViewedSection = document.getElementById("recentlyViewed");
const recentlyViewedList = document.getElementById("recentlyViewedList");
const recentlyViewedHint = document.getElementById("recentlyViewedHint");

const topCitiesList = document.getElementById("topCitiesList");
const topCitiesState = document.getElementById("topCitiesState");
const topCitiesHint = document.getElementById("topCitiesHint");

const topLocalitiesList = document.getElementById("topLocalitiesList");
const topLocalitiesState = document.getElementById("topLocalitiesState");

const topDevelopersSection = document.getElementById("trustedDevelopers");
const topDevelopersList = document.getElementById("topDevelopersList");


/* =========================================================
   LOAD PROPERTIES
========================================================= */

async function loadHomepage(){

  /* The build writes the cards into the page, so the refresh below
     runs behind real listings. A loading message is only needed when
     there is nothing there yet. */
  const prebuilt = !!propertyList.querySelector(".property-card");
  if(!prebuilt) propertyLoading.textContent = "Loading properties...";
  propertyLoading.style.display = prebuilt ? "none" : "block";
  propertyError.style.display = "none";
  propertyEmpty.style.display = "none";

  try{

    allProperties = await fetchAllProperties();

    renderSiteStats(allProperties);
    renderPopularProperties();
    renderNewLaunches();
    renderRecentlyViewed();
    renderTopCities();
    renderTopLocalities();
    renderTopDevelopers();
    populateHeroCityOptions();
    buildSearchSuggestionPool();

  }catch(error){

    console.error("Failed to fetch properties:", error);

    /* The build writes these sections into the HTML. If the live
       refresh fails, keep that content rather than replacing real
       listings with an error - for visitors and crawlers alike. */
    if(prebuilt){
      propertyLoading.style.display = "none";
      attachPropertyEvents(propertyList);
      attachPropertyEvents(newLaunchesList);
      return;
    }

    showPropertyError("Unable to load properties. Please try again.");
    showNewLaunchesError();
    showTopCitiesError();
    showTopLocalitiesError();

  }

}

function showPropertyError(message){
  propertyLoading.style.display = "none";
  propertyError.style.display = "block";
  propertyError.textContent = message;
  propertyEmpty.style.display = "none";
  propertyList.innerHTML = "";
  propertyScrollHint.style.display = "none";
  viewAllBtn.style.display = "none";
}


/* =========================================================
   RENDER POPULAR PROPERTIES (preview only - full list lives
   on projects/search.html, "View All" links there)
========================================================= */

function renderPopularProperties(){

  propertyLoading.style.display = "none";
  propertyError.style.display = "none";

  if(!allProperties.length){
    propertyList.innerHTML = "";
    propertyEmpty.textContent = "No properties found.";
    propertyEmpty.style.display = "block";
    propertyScrollHint.style.display = "none";
    viewAllBtn.style.display = "none";
    return;
  }

  propertyEmpty.style.display = "none";

  const preview = allProperties.slice(0, POPULAR_COUNT);

  propertyList.innerHTML = preview.map(p => createPropertyCard(p)).join("");

  viewAllBtn.style.display = "inline-flex";
  viewAllBtn.innerHTML = "View All →";

  propertyScrollHint.style.display = preview.length > 1 ? "block" : "none";

  attachPropertyEvents(propertyList);

}



/* =========================================================
   RENDER NEW LAUNCHES
   Only projects marked as a new launch (status or construction
   stage = new_launch) appear here, however long ago they were
   listed. "View All" behaves just like the Popular
   Properties section's button - it sends visitors to the
   full search page.
========================================================= */

function getNewLaunchProperties(){
  return allProperties.filter(property => property.is_new_launch);
}

function renderNewLaunches(){

  newLaunchesState.style.display = "none";

  const newLaunches = getNewLaunchProperties();

  if(!newLaunches.length){
    newLaunchesState.style.display = "block";
    newLaunchesState.textContent = "No new launch projects right now.";
    newLaunchesList.innerHTML = "";
    newLaunchesHint.style.display = "none";
    newLaunchesViewAllBtn.style.display = "none";
    return;
  }

  const items = newLaunches.slice(0, NEW_LAUNCH_COUNT);

  newLaunchesList.innerHTML = items.map(p => createPropertyCard(p, "New Launch", "st-new-launch")).join("");

  newLaunchesHint.style.display = items.length > 1 ? "block" : "none";
  newLaunchesViewAllBtn.style.display = "inline-flex";

  attachPropertyEvents(newLaunchesList);

}

function showNewLaunchesError(){
  newLaunchesState.style.display = "block";
  newLaunchesState.textContent = "Unable to load new launches.";
  newLaunchesList.innerHTML = "";
  newLaunchesHint.style.display = "none";
  newLaunchesViewAllBtn.style.display = "none";
}



/* =========================================================
   RENDER RECENTLY VIEWED
   Reads the id list projects/property-details.html writes to
   localStorage and shows the matching properties, most
   recently viewed first. The whole section stays hidden
   until there is at least one to show.
========================================================= */

const RECENTLY_VIEWED_COUNT = 8;

function getRecentlyViewedIds(){
  try{
    const ids = JSON.parse(localStorage.getItem("keys99_recently_viewed") || "[]");
    return Array.isArray(ids) ? ids : [];
  }catch(error){
    return [];
  }
}

function renderRecentlyViewed(){

  const ids = getRecentlyViewedIds();

  if(!ids.length){
    recentlyViewedSection.style.display = "none";
    return;
  }

  const byId = new Map(allProperties.map(property => [property.id, property]));

  const items = ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .slice(0, RECENTLY_VIEWED_COUNT);

  if(!items.length){
    recentlyViewedSection.style.display = "none";
    return;
  }

  recentlyViewedSection.style.display = "block";

  recentlyViewedList.innerHTML = items.map(p => createPropertyCard(p)).join("");

  recentlyViewedHint.style.display = items.length > 1 ? "block" : "none";

  attachPropertyEvents(recentlyViewedList);

}


/* =========================================================
   TOP 5 CITIES -> click redirects to projects/search.html?city=...
========================================================= */

/* =========================================================
   SECTION MARKUP + SITE NUMBERS
   Pure functions (no DOM): build/generate.js runs these same
   functions to write the sections and numbers into index.html,
   so crawlers see real content and links, and the live render
   below produces identical markup.
========================================================= */

/* City cards show the city's best-known monument (illustrations in
   assets/cities/). Cities without one get a generic skyline. */
const CITY_MONUMENTS = {
  "pune": ["pune", "Shaniwar Wada"],
  "mumbai": ["mumbai", "Gateway of India"],
  "delhi": ["delhi", "India Gate"],
  "new-delhi": ["delhi", "India Gate"],
  "bengaluru": ["bengaluru", "Vidhana Soudha"],
  "bangalore": ["bengaluru", "Vidhana Soudha"],
  "hyderabad": ["hyderabad", "Charminar"],
  "chennai": ["chennai", "Kapaleeshwarar Temple"],
  "kolkata": ["kolkata", "Victoria Memorial"],
  "jaipur": ["jaipur", "Hawa Mahal"]
};

/* A photo set in Supabase (cities.city_image) wins: the card shows the
   build's 640px copy, falling back to the photo itself and then to
   the illustration if a file is missing. */
function cityImage(city, photo){
  const name = titleCaseName(city);
  const found = CITY_MONUMENTS[slugify(city)];
  const drawing = found
    ? { src: `assets/cities/${found[0]}.svg`, alt: `${found[1]}, ${name}` }
    : { src: "assets/cities/city.svg", alt: `${name} skyline` };
  if(/^https?:\/\//i.test(photo || "")){
    return { src: THUMB_DIR + thumbName(photo), full: photo, fallback: drawing.src, alt: `${name} city` };
  }
  return drawing;
}

function cityCardHtml(item){
  const image = cityImage(item.city, item.image);
  const fallback = image.full
    ? ` data-full="${escapeHtml(image.full)}" data-fallback="${escapeHtml(image.fallback)}" onerror="if(this.dataset.full){this.src=this.dataset.full;this.dataset.full=''}else if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}"`
    : "";
  return `
    <a class="city-card" href="${escapeHtml(cityUrl(item.city, item.base))}">
      <span class="city-img"><img src="${escapeHtml(image.src)}"${fallback} alt="${escapeHtml(image.alt)}" loading="lazy" width="400" height="250"></span>
      <span class="city-body">
        <strong>${escapeHtml(titleCaseName(item.city))}</strong>
        <span>${item.count} ${item.count === 1 ? "Project" : "Projects"}</span>
      </span>
    </a>
  `;
}

function localityChipHtml(item){
  return `
    <a class="locality-chip" href="${escapeHtml(localityUrl(item.city, item.locality, item.base))}">
      <strong>${escapeHtml(titleCaseName(item.locality))}</strong>
      <span>${escapeHtml(titleCaseName(item.city) || "—")}</span>
      <span class="count">${item.count} ${item.count === 1 ? "Project" : "Projects"}</span>
    </a>
  `;
}

/* "Trusted Developers": the developers with published projects, most
   projects first. Only active, verified developers come back from the
   database (the card omits the rest), so every card is a verified
   builder. Each links to its developer page. */
function developerCardHtml(item){
  const mark = item.logo
    ? `<img src="${escapeHtml(item.logo)}" alt="${escapeHtml(item.name)} logo" loading="lazy" width="64" height="64" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'developer-initial',textContent:'${escapeHtml(item.name.charAt(0).toUpperCase())}'}))">`
    : `<span class="developer-initial" aria-hidden="true">${escapeHtml(item.name.charAt(0).toUpperCase())}</span>`;
  return `
    <a class="developer-card" href="developers/${escapeHtml(item.slug)}/">
      <span class="developer-mark">${mark}</span>
      <strong>${escapeHtml(item.name)}</strong>
      <span class="developer-meta">${item.count} ${item.count === 1 ? "Project" : "Projects"}${item.city ? " · " + escapeHtml(titleCaseName(item.city)) : ""}</span>
      <span class="developer-verified">✓ Verified</span>
    </a>
  `;
}

function computeTopDevelopers(properties, limit){

  const byName = new Map();

  properties.forEach(property => {
    const name = titleCaseName(property.developer);
    if(!name){
      return;
    }
    const key = slugify(name);
    if(!key){
      return;
    }
    if(!byName.has(key)){
      byName.set(key, { slug: key, name, count: 0, logo: "", cities: {} });
    }
    const entry = byName.get(key);
    entry.count++;
    if(property.developer_logo && !entry.logo) entry.logo = property.developer_logo;
    const city = String(property.city || "").trim();
    if(city) entry.cities[city] = (entry.cities[city] || 0) + 1;
  });

  return [...byName.values()]
    .sort((a,b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(entry => {
      const cities = Object.entries(entry.cities).sort((a,b) => b[1] - a[1]);
      return { slug: entry.slug, name: entry.name, count: entry.count, logo: entry.logo, city: cities.length ? cities[0][0] : "" };
    });

}

function renderTopDevelopers(){

  if(!topDevelopersList){
    return;
  }

  const developers = computeTopDevelopers(allProperties, TOP_DEVELOPER_COUNT);

  if(!developers.length){
    if(topDevelopersSection) topDevelopersSection.style.display = "none";
    topDevelopersList.innerHTML = "";
    return;
  }

  if(topDevelopersSection) topDevelopersSection.style.display = "";
  topDevelopersList.innerHTML = developers.map(developerCardHtml).join("");

}

/* Real numbers for the stats bar and property-type cards,
   counted from the published projects. */
function computeSiteStats(properties){
  const distinct = values => new Set(values.map(v => String(v || "").trim().toLowerCase()).filter(Boolean)).size;
  /* Resale and rent are listing types, counted alongside the
     categories. Rentals are not listed yet, so rent stays 0
     ("Coming soon"). */
  const types = { residential:0, commercial:0, plots:0, luxury:0, resale:0, rent:0 };
  properties.forEach(p => {
    const category = getCategory(p);
    if(category in types) types[category]++;
    if(p.is_resale) types.resale++;
  });
  return {
    projects: properties.length,
    developers: distinct(properties.map(p => p.developer)),
    cities: distinct(properties.map(p => p.city)),
    rera: properties.filter(p => String(p.rera_id || "").trim()).length,
    types
  };
}

function formatStatCount(n){
  return Number(n || 0).toLocaleString("en-IN");
}

function typeCountText(n){
  return n ? `${formatStatCount(n)} ${n === 1 ? "Project" : "Projects"}` : "Coming soon";
}

/* A type with projects links to its search results; one without is
   left as a "Coming soon" card with no link. build/homepage.js makes
   the same change in the pre-rendered HTML. */
function setTypeCardState(card, count){
  if(count){
    /* Commercial has its own section; the other types are search filters. */
    card.setAttribute("href", card.dataset.type === "commercial" ? "commercial/"
      : "projects/search?type=" + encodeURIComponent(card.dataset.type));
    card.removeAttribute("aria-disabled");
  }else{
    card.removeAttribute("href");
    card.setAttribute("aria-disabled", "true");
  }
}

function renderSiteStats(properties){
  const stats = computeSiteStats(properties);
  document.querySelectorAll("[data-stat]").forEach(el => {
    el.textContent = formatStatCount(stats[el.dataset.stat]);
  });
  document.querySelectorAll("[data-type-count]").forEach(el => {
    el.textContent = typeCountText(stats.types[el.dataset.typeCount]);
  });
  document.querySelectorAll(".type-card[data-type]").forEach(card => {
    setTypeCardState(card, stats.types[card.dataset.type]);
  });
}

function computeTopCities(properties, limit){

  const counts = {};
  const images = {};
  const homes = {};

  properties.forEach(property => {
    const city = String(property.city || "").trim();
    if(!city){
      return;
    }
    counts[city] = (counts[city] || 0) + 1;
    if((property.base || "projects") === "projects") homes[city] = true;
    if(property.city_image && !images[city]) images[city] = property.city_image;
  });

  /* The card links to the city's homes page, or to its commercial
     page when the city only has commercial projects. */
  return Object.entries(counts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, limit)
    .map(([city, count]) => ({ city, count, image: images[city] || "", base: homes[city] ? "projects" : "commercial" }));

}

function renderTopCities(){

  topCitiesState.style.display = "none";

  const cities = computeTopCities(allProperties, TOP_CITY_COUNT);

  if(!cities.length){
    topCitiesState.style.display = "block";
    topCitiesState.textContent = "No cities available yet.";
    topCitiesList.innerHTML = "";
    topCitiesHint.style.display = "none";
    return;
  }

  /* Anchors rather than role="button" divs: these are the links
     that let Google reach the generated city hubs at all, and
     they are keyboard-accessible for free. The hub shows the
     same listings the old search.html?city= link did. */
  topCitiesList.innerHTML = cities.map(cityCardHtml).join("");

  /* Four round city icons fit across even a small phone, so the
     swipe hint only shows when there are more than that. */
  topCitiesHint.style.display = cities.length > 4 ? "block" : "none";

}

function showTopCitiesError(){
  topCitiesState.style.display = "block";
  topCitiesState.textContent = "Unable to load cities.";
  topCitiesList.innerHTML = "";
  topCitiesHint.style.display = "none";
}


/* =========================================================
   TOP 10 LOCALITIES -> click redirects to
   projects/search.html?locality=...&city=...
========================================================= */

function computeTopLocalities(properties, limit){

  const counts = {};

  properties.forEach(property => {

    const locality = String(property.locality || "").trim();

    if(!locality){
      return;
    }

    const city = String(property.city || "").trim();
    const key = locality + "|" + city;

    if(!counts[key]){
      counts[key] = { locality, city, count:0, base:"commercial" };
    }

    counts[key].count++;
    if((property.base || "projects") === "projects") counts[key].base = "projects";

  });

  return Object.values(counts)
    .sort((a,b) => b.count - a.count)
    .slice(0, limit);

}

function renderTopLocalities(){

  topLocalitiesState.style.display = "none";

  const localities = computeTopLocalities(allProperties, TOP_LOCALITY_COUNT);

  if(!localities.length){
    topLocalitiesState.style.display = "block";
    topLocalitiesState.textContent = "No localities available yet.";
    topLocalitiesList.innerHTML = "";
    return;
  }

  topLocalitiesList.innerHTML = localities.map(localityChipHtml).join("");

}

function showTopLocalitiesError(){
  topLocalitiesState.style.display = "block";
  topLocalitiesState.textContent = "Unable to load localities.";
  topLocalitiesList.innerHTML = "";
}


/* =========================================================
   PROPERTY TYPE CARDS
   Plain links to projects/search.html?type=residential (etc.),
   so search engines can follow them. A type with no projects
   yet has its href removed (see setTypeCardState) rather than
   linking to an empty results page.
========================================================= */


/* =========================================================
   HERO SEARCH -> redirects to projects/search.html with filters
========================================================= */

const searchForm = document.getElementById("searchForm");
const heroCity = document.getElementById("heroCity");
const heroLocality = document.getElementById("heroLocality");

if(searchForm){
  searchForm.addEventListener("submit", event => {
    event.preventDefault();
    goToSearch(heroSearchParams());
  });
}


/* =========================================================
   HERO FILTER PANEL - extra filters (city, locality, status,
   price range, sort) tucked behind a "Filters" toggle so the
   main bar stays compact.
========================================================= */

const filterToggleBtn = document.getElementById("filterToggleBtn");
const heroFilterPanel = document.getElementById("heroFilterPanel");
const heroFilterClear = document.getElementById("heroFilterClear");

function closeHeroFilterPanel(){
  heroFilterPanel.hidden = true;
  filterToggleBtn.setAttribute("aria-expanded", "false");
  filterToggleBtn.classList.remove("active");
}

function openHeroFilterPanel(){
  heroFilterPanel.hidden = false;
  filterToggleBtn.setAttribute("aria-expanded", "true");
  filterToggleBtn.classList.add("active");
}

if(filterToggleBtn && heroFilterPanel){

  filterToggleBtn.addEventListener("click", event => {
    event.stopPropagation();
    if(heroFilterPanel.hidden){
      openHeroFilterPanel();
    }else{
      closeHeroFilterPanel();
    }
  });

  heroFilterPanel.addEventListener("click", event => event.stopPropagation());

  document.addEventListener("click", () => closeHeroFilterPanel());

  document.addEventListener("keydown", event => {
    if(event.key === "Escape"){
      closeHeroFilterPanel();
    }
  });

}

if(heroFilterClear){
  heroFilterClear.addEventListener("click", () => {
    document.getElementById("heroStatus").value = "";
    document.getElementById("heroMinPrice").value = "";
    document.getElementById("heroMaxPrice").value = "";
    document.getElementById("heroSort").value = "newest";
    if(heroCity){ heroCity.value = ""; }
    if(heroLocality){ populateHeroLocalityOptions(""); heroLocality.value = ""; }
    const heroDeveloper = document.getElementById("heroDeveloper");
    if(heroDeveloper){ heroDeveloper.value = ""; }
  });
}

function populateHeroCityOptions(){

  if(!heroCity){
    return;
  }

  const cities = [...new Set(
    allProperties.map(p => String(p.city || "").trim()).filter(Boolean)
  )].sort((a,b) => a.localeCompare(b));

  heroCity.innerHTML = `<option value="">All Cities</option>` +
    cities.map(city => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join("");

  populateHeroLocalityOptions("");
  populateHeroDeveloperOptions();
  populateHeroBhkOptions();

}

/* Developers with a project, A to Z (the search page matches by name). */
function populateHeroDeveloperOptions(){

  const select = document.getElementById("heroDeveloper");
  if(!select){
    return;
  }

  const names = [...new Set(
    allProperties.map(p => titleCaseName(p.developer)).filter(Boolean)
  )].sort((a,b) => a.localeCompare(b));

  select.innerHTML = `<option value="">All Developers</option>` +
    names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

}

/* BHK / Unit follows the property type, as on the search page: BHK
   sizes for homes, unit types (Office Space, Shop...) for commercial,
   nothing for plots. */
function populateHeroBhkOptions(){

  const select = document.getElementById("bhkType");
  if(!select){
    return;
  }

  const sizes = new Set(), units = new Set();
  allProperties.forEach(p => getBhkOptions(p).forEach(option => {
    const label = normaliseBhkType(option.type);
    if(!label){
      return;
    }
    if(/bhk/i.test(label)){
      sizes.add(label);
    }else if(p.kind === "commercial"){
      units.add(label);
    }
  }));

  const sortedSizes = [...sizes].sort((a,b) => parseFloat(a) - parseFloat(b));
  const option = (value, label, group) =>
    `<option value="${escapeHtml(value)}" data-group="${group}">${escapeHtml(label)}</option>`;

  select.innerHTML = `<option value="">BHK Type</option>` +
    sortedSizes.map(label => option(label.toLowerCase(), label, "home")).join("") +
    option("4+ bhk", "4+ BHK", "home") +
    [...units].sort().map(label => option(label.toLowerCase(), label, "commercial")).join("");

  syncHeroBhk();

}

function syncHeroBhk(){

  const select = document.getElementById("bhkType");
  const field = document.getElementById("bhkField");
  const typeSelect = document.getElementById("propertyType");
  if(!select || !typeSelect){
    return;
  }

  const type = typeSelect.value;
  const show = type === "commercial" ? "commercial"
    : ["residential", "luxury", "resale"].includes(type) ? "home" : "";

  [...select.options].forEach(o => {
    if(o.value){
      o.hidden = !!show && o.dataset.group !== show;
    }
  });

  const current = select.options[select.selectedIndex];
  if((current && current.hidden) || type === "plots"){
    select.value = "";
  }

  if(field){
    field.style.display = type === "plots" ? "none" : "";
  }
  select.options[0].textContent = show === "commercial" ? "Unit Type" : "BHK Type";

}

{
  const propertyTypeSelect = document.getElementById("propertyType");
  if(propertyTypeSelect){
    propertyTypeSelect.addEventListener("change", syncHeroBhk);
  }
}

function populateHeroLocalityOptions(selectedCity){

  if(!heroLocality){
    return;
  }

  const scoped = selectedCity
    ? allProperties.filter(p => String(p.city || "").trim().toLowerCase() === selectedCity.toLowerCase())
    : allProperties;

  const localities = [...new Set(
    scoped.map(p => String(p.locality || "").trim()).filter(Boolean)
  )].sort((a,b) => a.localeCompare(b));

  heroLocality.innerHTML = `<option value="">All Localities</option>` +
    localities.map(locality => `<option value="${escapeHtml(locality)}">${escapeHtml(locality)}</option>`).join("");

}

if(heroCity){
  heroCity.addEventListener("change", () => {
    populateHeroLocalityOptions(heroCity.value);
  });
}


/* =========================================================
   SEARCH SUGGESTIONS
   As the user types, suggest matching property listings,
   cities, localities, developers and BHK configs (e.g.
   "1 BHK Apartment") drawn straight from the loaded data.
   Matching is fuzzy - it does not require an exact
   contiguous substring: each word of the query is matched
   independently (in any order) against the suggestion's
   text, and a small edit-distance tolerance covers minor
   typos ("powei" still finds "Powai").
========================================================= */

let searchSuggestionPool = [];
let activeSuggestionIndex = -1;

/* Levenshtein edit distance - small strings only (word-length
   tokens), so a plain O(n*m) DP table is plenty fast. */

function levenshteinDistance(a, b){

  const m = a.length;
  const n = b.length;

  if(m === 0){ return n; }
  if(n === 0){ return m; }

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for(let i = 0; i <= m; i++){ dp[i][0] = i; }
  for(let j = 0; j <= n; j++){ dp[0][j] = j; }

  for(let i = 1; i <= m; i++){
    for(let j = 1; j <= n; j++){
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];

}

/* Scores how well `text` matches `query`. Every whitespace-
   separated word in the query must be found somewhere in the
   text (as a substring, or as a near-miss typo of one of the
   text's words) - order doesn't matter. Returns 0 for no
   match, otherwise a higher score for closer matches. */

function fuzzyMatchScore(text, query){

  const lowerText = String(text || "").toLowerCase();
  const tokens = String(query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);

  if(!tokens.length || !lowerText){
    return 0;
  }

  const words = lowerText.split(/[\s,.-]+/).filter(Boolean);

  let score = 0;

  for(const token of tokens){

    /* Plain "includes" is too loose for a bare number - "1"
       would match inside "Plot 12" or a pincode. Require a
       digit boundary so "1" only matches "1", "1bhk", "1 bhk"
       etc, never the "1" inside "12". Word tokens keep using
       a normal substring match (so "pow" still finds "Powai"). */

    const isNumericToken = /^\d+$/.test(token);

    const hasMatch = isNumericToken
      ? new RegExp("(?<!\\d)" + token + "(?!\\d)").test(lowerText)
      : lowerText.includes(token);

    if(hasMatch){
      score += 3;
      continue;
    }

    const allowedDistance = token.length <= 3 ? 0 : token.length <= 6 ? 1 : 2;

    let bestDistance = Infinity;

    for(const word of words){
      const distance = levenshteinDistance(word.slice(0, token.length + allowedDistance + 1), token);
      if(distance < bestDistance){
        bestDistance = distance;
      }
    }

    if(bestDistance <= allowedDistance){
      score += 1;
    }else{
      return 0;
    }

  }

  return score;

}

function buildSearchSuggestionPool(){

  const seen = new Set();
  const pool = [];

  function addSuggestion(entry){
    const key = entry.type + "|" + entry.label.toLowerCase();
    if(!entry.label || seen.has(key)){
      return;
    }
    seen.add(key);
    pool.push(entry);
  }

  allProperties.forEach(property => {

    const city = String(property.city || "").trim();
    const locality = String(property.locality || "").trim();
    const developer = String(property.developer || "").trim();

    if(city){
      addSuggestion({ label: city, matchText: city, type: "City", icon: "⌖", city });
    }

    if(locality){
      addSuggestion({
        label: locality + (city ? ", " + city : ""),
        matchText: locality + " " + city,
        type: "Locality",
        icon: "⌖",
        city,
        locality
      });
    }

    if(developer){
      addSuggestion({ label: developer, matchText: developer, type: "Developer", icon: "▥" });
    }

    const category = getCategory(property);
    const categoryLabel = CATEGORY_LABELS[category] || "Property";

    getPropertyTypes(property).forEach(bhk => {
      addSuggestion({
        label: bhk + " " + categoryLabel,
        matchText: bhk + " " + categoryLabel,
        type: "Property Type",
        icon: "▣",
        bhk: normaliseBhkType(bhk).toLowerCase()
      });
    });

    const title = getCardTitle(property);
    const location = getLocationText(property);

    addSuggestion({
      label: title + " — " + location,
      matchText: [title, property.overview, property.address, developer, city, locality].filter(Boolean).join(" "),
      type: "Property",
      icon: "⌂",
      propertyId: property.id,
      url: propertyUrl(property)
    });

  });

  searchSuggestionPool = pool;

}

const searchInputEl = document.getElementById("searchInput");
const searchSuggestionsEl = document.getElementById("searchSuggestions");

function renderSuggestions(matches){

  activeSuggestionIndex = -1;

  if(!matches.length){
    searchSuggestionsEl.hidden = true;
    searchSuggestionsEl.innerHTML = "";
    return;
  }

  searchSuggestionsEl.innerHTML = matches.map((item, index) => `
    <div class="suggest-item" data-index="${index}" role="option">
      <span class="suggest-icon">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
      <span class="suggest-type">${escapeHtml(item.type)}</span>
    </div>
  `).join("");

  searchSuggestionsEl.hidden = false;

  searchSuggestionsEl.querySelectorAll(".suggest-item").forEach(el => {
    el.addEventListener("mousedown", event => {
      event.preventDefault();
      selectSuggestion(matches[Number(el.dataset.index)]);
    });
  });

}

/* A project opens its own page (projects/<slug>/ - a folder, so it
   works on any host). A city, locality or flat size searches with
   that filter rather than its label as text: "Rau, Indore" or
   "2 BHK Apartment" never appear word for word in a project. */
function selectSuggestion(item){

  if(item.type === "Property" && (item.url || item.propertyId)){
    window.location.href = item.url || ("projects/property-details.html?id=" + encodeURIComponent(item.propertyId));
    return;
  }

  searchSuggestionsEl.hidden = true;
  searchSuggestionsEl.innerHTML = "";

  const filters = item.type === "City" ? { city: item.city }
    : item.type === "Locality" ? { city: item.city, locality: item.locality }
    : item.type === "Property Type" ? { bhk: item.bhk }
    : null;

  if(filters){
    goToSearch({ ...heroSearchParams(), q: "", ...filters });
    return;
  }

  searchInputEl.value = item.label;
  searchForm.requestSubmit();

}

function getCurrentMatches(){

  const query = searchInputEl.value.trim();

  if(!query){
    return [];
  }

  return searchSuggestionPool
    .map(item => ({ item, score: fuzzyMatchScore(item.matchText, query) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(entry => entry.item);

}

if(searchInputEl){

  searchInputEl.addEventListener("input", () => {
    renderSuggestions(getCurrentMatches());
  });

  searchInputEl.addEventListener("focus", () => {
    if(searchInputEl.value.trim()){
      renderSuggestions(getCurrentMatches());
    }
  });

  searchInputEl.addEventListener("keydown", event => {

    const items = searchSuggestionsEl.querySelectorAll(".suggest-item");

    if(searchSuggestionsEl.hidden || !items.length){
      return;
    }

    if(event.key === "ArrowDown"){
      event.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
    }else if(event.key === "ArrowUp"){
      event.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    }else if(event.key === "Escape"){
      searchSuggestionsEl.hidden = true;
      return;
    }else if(event.key === "Enter" && activeSuggestionIndex >= 0){
      event.preventDefault();
      const matches = getCurrentMatches();
      selectSuggestion(matches[activeSuggestionIndex]);
      return;
    }else{
      return;
    }

    items.forEach((el, index) => {
      el.classList.toggle("active", index === activeSuggestionIndex);
    });

  });

  document.addEventListener("click", event => {
    if(!searchInputEl.contains(event.target) && !searchSuggestionsEl.contains(event.target)){
      searchSuggestionsEl.hidden = true;
    }
  });

}


/* =========================================================
   INIT
========================================================= */

initBottomNav("home");

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initLoginButton();
  loadHomepage();
});


/* =========================================================
   LAZY BACKGROUND IMAGES
   CSS background photos cannot use loading="lazy". Elements marked
   data-lazy-bg get the class .bg-ready (which adds the photo in CSS)
   when they come within 400px of the screen; without
   IntersectionObserver they get it straight away.
========================================================= */

(function lazyBackgrounds(){
  const targets = document.querySelectorAll("[data-lazy-bg]");
  if(!targets.length) return;
  if(!("IntersectionObserver" in window)){
    targets.forEach(el => el.classList.add("bg-ready"));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      entry.target.classList.add("bg-ready");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "400px 0px" });
  targets.forEach(el => observer.observe(el));
})();

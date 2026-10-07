/* =========================================================
   KEYS99 - PROJECT CORE

   Shared by the project page in the browser and by
   build/generate.js in Node, so a generated page and the live
   page always produce the same markup from the same row.

   - PROJECT_DETAIL_SELECT  the Supabase query for one project
                            with all its related tables
   - normalizeProject(row)  flattens that row into one object
   - render*(project)       return HTML strings for each section

   No DOM access in here - only strings - so Node can use it.
========================================================= */

(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  else root.Keys99Project = api;
})(typeof self !== "undefined" ? self : this, function(){

  /* Every embed names its foreign key: residential_projects has
     two paths to localities, and naming all of them keeps the
     query from breaking if another path is ever added. */
  const PROJECT_DETAIL_SELECT = `
    id, slug, project_name, project_type, status, construction_stage, possession_status,
    launch_date, rera_number, rera_numbers, rera_possession_date, target_possession_date,
    construction_start_date, expected_completion_date, project_phase,
    address, pincode, latitude, longitude,
    total_land_area, land_area_unit, total_towers_buildings, total_floors,
    total_residential_units, units_per_floor, number_of_phases,
    built_up_project_area, built_up_project_area_unit,
    open_green_area_value, open_green_area_unit,
    overview, highlights,
    starting_price, maximum_price, price_on_request, price_disclaimer,
    flooring, doors, windows, kitchen, bathroom, electrical, walls_paint, balcony,
    other_specifications,
    main_image_path, main_image_bucket, seo_title, seo_description,
    view_count, published_at, created_at, updated_at,
    developer:developers!residential_projects_developer_id_fkey ( name, description, logo_url, website ),
    agent:agents!residential_projects_agent_id_fkey ( full_name, phone, whatsapp ),
    city:cities!residential_projects_city_id_fkey ( name, state, city_image ),
    locality:localities!residential_projects_locality_id_fkey ( name ),
    configurations:residential_configurations!residential_configurations_project_id_fkey (
      bhk_type, variant_name, carpet_area, built_up_area, super_built_up_area, area_unit,
      starting_price, maximum_price, price_type, price_on_request, availability,
      parking_included, parking_type, display_order, updated_at
    ),
    media:residential_media!residential_media_project_id_fkey (
      media_type, category, title, description, media_url, media_path, storage_bucket,
      alt_text, platform, is_primary, is_active, display_order, created_at
    ),
    amenities:residential_amenities!residential_amenities_project_id_fkey (
      category, amenity_name, is_available, display_order
    ),
    nearby:residential_nearby_locations!residential_nearby_locations_project_id_fkey (
      category, location_type, name, distance, distance_unit, display_order
    ),
    faqs:residential_faqs!residential_faqs_project_id_fkey (
      question, answer, is_published, display_order
    ),
    pros_cons:residential_project_pros_cons!residential_project_pros_cons_project_id_fkey (
      item_type, content, is_published, display_order
    ),
    blogs:residential_project_blogs!residential_project_blogs_project_id_fkey (
      title, slug, excerpt, body, cover_image_url, cover_image_path, storage_bucket,
      author, tags, meta_description, is_published, published_at, created_at, updated_at,
      display_order
    ),
    floor_plans:residential_floor_plans!residential_floor_plans_project_id_fkey (
      bhk_type, plan_type, title, image_url, image_path, storage_bucket,
      alt_text, is_active, display_order
    ),
    towers:residential_towers!residential_towers_project_id_fkey (
      tower_name, number_of_floors, number_of_units, configurations,
      tower_status, construction_stage, possession_status, expected_completion_date, display_order
    ),
    phases:residential_project_phases!residential_project_phases_project_id_fkey (
      phase_name, construction_start_date, expected_completion_date, rera_possession_date,
      target_possession_date, configurations, units_per_phase, display_order
    ),
    updates:residential_construction_updates!residential_construction_updates_project_id_fkey (
      update_title, update_date, construction_stage, description, is_published, display_order,
      media:residential_construction_update_media!residential_construction_update_media_update_id_fkey (
        media_url, media_path, storage_bucket, alt_text, caption, display_order
      )
    ),
    documents:residential_documents!residential_documents_project_id_fkey (
      document_type, title, description, visibility
    ),
    litigation:residential_litigation!residential_litigation_project_id_fkey (
      status, case_reference_number, case_title, court_tribunal, case_type, current_status,
      filing_date, latest_hearing_date, next_hearing_date, source_reference_url
    )
  `;

  /* The same page for a commercial project (offices, shops,
     showrooms...): commercial_projects and its commercial_* tables,
     which mirror the residential ones. commercial_units takes the
     place of residential_configurations; there is no floor plan
     table. normalizeProject(row, { kind:"commercial" }) maps it to
     the same shape, so every renderer below works for both. */
  const COMMERCIAL_DETAIL_SELECT = `
    id, slug, project_name, project_type, transaction_type, status,
    launch_date, rera_number, rera_numbers,
    address, pincode, latitude, longitude,
    total_land_area, land_area_unit, total_towers_buildings, total_floors,
    total_commercial_units, number_of_phases, total_leasable_area, total_saleable_area,
    typical_floor_plate, area_unit, built_up_project_area, built_up_project_area_unit,
    open_green_area_value, open_green_area_unit, occupancy_certificate,
    overview, highlights,
    starting_price, maximum_price, price_on_request, price_disclaimer,
    maintenance_charges, security_deposit_months, lock_in_period_months, rent_escalation_percent,
    structure, flooring, facade_glazing, lifts_elevators, hvac, power_load_backup, fire_safety,
    floor_to_ceiling_height, washrooms_pantry, loading_docks, other_specifications,
    main_image_path, main_image_bucket, seo_title, seo_description,
    view_count, published_at, created_at, updated_at,
    developer:developers!commercial_projects_developer_id_fkey ( name, description, logo_url, website ),
    agent:agents!commercial_projects_agent_id_fkey ( full_name, phone, whatsapp ),
    city:cities!commercial_projects_city_id_fkey ( name, state, city_image ),
    locality:localities!commercial_projects_locality_id_fkey ( name ),
    units:commercial_units!commercial_units_project_id_fkey (
      unit_type, variant_name, floor_level, transaction_type, carpet_area, built_up_area,
      super_built_up_area, area_unit, starting_price, maximum_price, price_type, expected_rent,
      price_on_request, availability, number_of_units, furnishing, washroom, pantry,
      parking_included, parking_type, display_order, updated_at
    ),
    media:commercial_media!commercial_media_project_id_fkey (
      media_type, category, title, description, media_url, media_path, storage_bucket,
      alt_text, platform, is_primary, is_active, display_order, created_at
    ),
    amenities:commercial_amenities!commercial_amenities_project_id_fkey (
      category, amenity_name, is_available, display_order
    ),
    nearby:commercial_nearby_locations!commercial_nearby_locations_project_id_fkey (
      category, location_type, name, distance, distance_unit, display_order
    ),
    faqs:commercial_faqs!commercial_faqs_project_id_fkey (
      question, answer, is_published, display_order
    ),
    pros_cons:commercial_project_pros_cons!commercial_project_pros_cons_project_id_fkey (
      item_type, content, is_published, display_order
    ),
    blogs:commercial_project_blogs!commercial_project_blogs_project_id_fkey (
      title, slug, excerpt, body, cover_image_url, cover_image_path, storage_bucket,
      author, tags, meta_description, is_published, published_at, created_at, updated_at,
      display_order
    ),
    towers:commercial_towers!commercial_towers_project_id_fkey (
      tower_name, number_of_floors, number_of_units, configurations,
      tower_status, construction_stage, possession_status, expected_completion_date, display_order
    ),
    phases:commercial_project_phases!commercial_project_phases_project_id_fkey (
      phase_name, construction_start_date, expected_completion_date, rera_possession_date,
      target_possession_date, configurations, units_per_phase, display_order
    ),
    updates:commercial_construction_updates!commercial_construction_updates_project_id_fkey (
      update_title, update_date, construction_stage, description, is_published, display_order,
      media:commercial_construction_update_media!commercial_construction_update_media_update_id_fkey (
        media_url, media_path, storage_bucket, alt_text, caption, display_order
      )
    ),
    documents:commercial_documents!commercial_documents_project_id_fkey (
      document_type, title, description, visibility
    ),
    litigation:commercial_litigation!commercial_litigation_project_id_fkey (
      status, case_reference_number, case_title, court_tribunal, case_type, current_status,
      filing_date, latest_hearing_date, next_hearing_date, source_reference_url
    )
  `;

  /* Per kind: where its pages live, its tables, and the words used
     about it. "residential" is the default everywhere. */
  const KINDS = {
    residential: {
      kind: "residential", base: "projects", table: "residential_projects",
      enquiries: "residential_enquiries", select: null,
      noun: "residential project", nouns: "residential projects", unitWord: "flat", unitWords: "flats",
      configWord: "Configuration"
    },
    commercial: {
      kind: "commercial", base: "commercial", table: "commercial_projects",
      enquiries: "commercial_enquiries", select: null,
      noun: "commercial project", nouns: "commercial projects", unitWord: "unit", unitWords: "units",
      configWord: "Unit Type"
    }
  };
  KINDS.residential.select = PROJECT_DETAIL_SELECT;
  KINDS.commercial.select = COMMERCIAL_DETAIL_SELECT;

  function kindOf(v){
    const key = v && typeof v === "object" ? v.kind : v;
    return KINDS[key] || KINDS.residential;
  }

  /* ---------------- LABELS ---------------- */

  const STATUS_LABELS = {
    upcoming:"Upcoming",
    new_launch:"New Launch",
    under_construction:"Under Construction",
    nearing_possession:"Nearing Possession",
    possession_started:"Possession Started",
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
    other:"Residential Project"
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

  const TRANSACTION_LABELS = { sale:"For Sale", lease:"For Lease", sale_and_lease:"For Sale & Lease" };

  const FURNISHING_LABELS = {
    bare_shell:"Bare Shell", warm_shell:"Warm Shell", semi_furnished:"Semi Furnished",
    fully_furnished:"Fully Furnished", plug_and_play:"Plug & Play"
  };

  const OC_LABELS = { received:"Received", applied:"Applied", not_applied:"Not Applied" };

  const AVAILABILITY_LABELS = {
    available:"Available",
    sold_out:"Sold Out",
    leased_out:"Leased Out",
    on_request:"On Request"
  };

  const AMENITY_CATEGORY_LABELS = {
    clubhouse_community:"Clubhouse & Community",
    sports_fitness:"Sports & Fitness",
    recreation_outdoors:"Recreation & Outdoors",
    security_safety:"Security & Safety",
    parking_mobility:"Parking & Mobility",
    utilities_power:"Utilities & Power",
    building_facilities:"Building Facilities",
    family_children:"Family & Children",
    lifestyle:"Lifestyle",
    eco_friendly:"Eco Friendly",
    building_services:"Building Services",
    business_facilities:"Business Facilities",
    connectivity_it:"Connectivity & IT",
    food_beverage:"Food & Beverage",
    logistics:"Logistics",
    power_utilities:"Power & Utilities",
    wellness_lifestyle:"Wellness & Lifestyle"
  };

  const NEARBY_CATEGORY_LABELS = {
    transport:"Transport",
    education:"Education",
    healthcare:"Healthcare",
    shopping_retail:"Shopping",
    business_employment:"Business Hub",
    lifestyle_entertainment:"Entertainment"
  };

  const UNIT_LABELS = { acre:"Acres", sq_ft:"Sq.Ft", sq_m:"Sq.M", percent:"%" };

  const SPEC_FIELDS = [
    ["flooring","Flooring"],
    ["doors","Doors"],
    ["windows","Windows"],
    ["kitchen","Kitchen"],
    ["bathroom","Bathroom"],
    ["electrical","Electrical"],
    ["walls_paint","Walls & Paint"],
    ["balcony","Balcony"],
    ["other_specifications","Other"]
  ];

  const COMMERCIAL_SPEC_FIELDS = [
    ["structure","Structure"],
    ["flooring","Flooring"],
    ["facade_glazing","Facade & Glazing"],
    ["lifts_elevators","Lifts & Elevators"],
    ["hvac","HVAC"],
    ["power_load_backup","Power Load & Backup"],
    ["fire_safety","Fire Safety"],
    ["floor_to_ceiling_height","Floor-to-Ceiling Height"],
    ["washrooms_pantry","Washrooms & Pantry"],
    ["loading_docks","Loading Docks"],
    ["other_specifications","Other"]
  ];

  const DOCUMENT_TYPE_LABELS = {
    rera_certificate:"RERA Certificate",
    price_sheet:"Price Sheet",
    brochure:"Brochure",
    floor_plan:"Floor Plan",
    approval:"Approval",
    agreement:"Agreement Draft"
  };

  const LITIGATION_LABELS = {
    no_known_litigation:"No known litigation",
    litigation_reported:"Litigation reported",
    resolved:"Resolved"
  };

  const PARKING_LABELS = { included:"Included", optional:"Optional", paid:"Paid", not_available:"Not available" };

  /* ---------------- SMALL HELPERS ---------------- */

  /* "under_construction" -> "Under Construction", for codes with no label. */
  function codeLabel(v, labels){
    const key = clean(v);
    return (labels && labels[key]) || STATUS_LABELS[key] || titleCase(key.replace(/_/g, " "));
  }

  /* "3" -> "Floor 3"; "Ground" -> "Ground Floor"; "3rd floor" as is. */
  function floorLabel(v){
    const f = clean(v);
    if(!f) return "";
    if(/floor/i.test(f)) return titleCase(f);
    return /^\d+$/.test(f) ? "Floor " + f : titleCase(f) + " Floor";
  }

  /* "Office Space, Shop & Showroom" - at most max items. */
  function joinList(items, max){
    const l = items.slice(0, max || items.length);
    return l.length > 1 ? l.slice(0, -1).join(", ") + " & " + l[l.length - 1] : (l[0] || "");
  }

  function formatDate(v){
    if(!v) return "";
    const d = new Date(v);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString("en-IN",{ day:"numeric", month:"short", year:"numeric", timeZone:"UTC" })
      : "";
  }

  function clean(v){
    return v === undefined || v === null ? "" : String(v).trim();
  }

  function escapeHtml(v){
    return String(v ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  /* Free-text names arrive as "emerald heights ", "moshi". Leave
     short all-caps words (DLF, RERA) alone. */
  function titleCase(v){
    return clean(v).replace(/\s+/g," ").split(" ").filter(Boolean).map(w =>
      w.length <= 4 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(" ");
  }

  function normaliseBhk(v){
    const s = clean(v);
    const m = s.match(/^(\d+(?:\.\d+)?)\s*bhk$/i);
    return m ? m[1] + " BHK" : titleCase(s);
  }

  function byOrder(a,b){
    return (a.display_order || 0) - (b.display_order || 0);
  }

  function list(v){
    return Array.isArray(v) ? v.slice().sort(byOrder) : [];
  }

  function formatPrice(n){
    n = Number(n);
    if(!Number.isFinite(n) || n <= 0) return "";
    if(n >= 10000000){
      const cr = n / 10000000;
      return "₹ " + (+cr.toFixed(2)) + " Cr";
    }
    if(n >= 100000){
      const l = n / 100000;
      return "₹ " + (+l.toFixed(2)) + " Lakh";
    }
    return "₹ " + n.toLocaleString("en-IN");
  }

  const SQFT_PER_SQM = 10.7639;

  function formatRate(perSqft){
    return "₹ " + formatNumber(Math.round(perSqft / 10) * 10) + " / Sq.Ft";
  }

  function formatNumber(n){
    n = Number(n);
    return Number.isFinite(n) ? (+n.toFixed(2)).toLocaleString("en-IN") : "";
  }

  /* Newest of some timestamps, as given; "" when none parse. */
  function latest(values){
    return values.filter(v => v && Number.isFinite(new Date(v).getTime()))
      .sort((a, b) => new Date(b) - new Date(a))[0] || "";
  }

  function formatMonthYear(v){
    if(!v) return "";
    const d = new Date(v);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString("en-IN",{ month:"short", year:"numeric", timeZone:"UTC" })
      : "";
  }

  function storagePublicUrl(supabaseUrl, bucket, path){
    if(!supabaseUrl || !bucket || !path) return "";
    return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" +
      String(path).split("/").map(encodeURIComponent).join("/");
  }

  /* Photos are uploaded at full camera size (often 1-2 MB). The build
     (build/thumbs.js) writes WebP copies to assets/thumbs/, named by a
     hash of the original URL plus the width: 1280px for the main photo,
     lightbox and floor plans, 320px for the gallery strip, and the
     640px card copy (no width suffix) for similar projects. The hash is
     the same 32-bit FNV-1a as thumbName() in index.html. A copy that
     does not exist yet (project added since the last build) falls back
     to the original through IMG_FALLBACK. */
  const THUMB_DIR = "assets/thumbs/";
  const IMAGE_WIDTHS = { large: 1280, small: 320 };
  const IMG_FALLBACK = "if(this.dataset.full){this.src=this.dataset.full;this.dataset.full=''}";
  /* Blog covers: resized copy, then the original, then no image. */
  const COVER_FALLBACK = "if(this.dataset.full){this.src=this.dataset.full;this.dataset.full=''}else{this.remove()}";

  /* Posts shorter than this are built and linked but kept out of
     search engines' index (thin content counts against the site). */
  const MIN_INDEXED_WORDS = 250;

  function urlHash(url){
    let hash = 0x811c9dc5;
    for(let i = 0; i < url.length; i++){
      hash ^= url.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function thumbName(url, width){
    return urlHash(url) + (width ? "-" + width : "") + ".webp";
  }

  /* Link-preview image (WhatsApp, Facebook...): 1200x630 JPEG, small
     enough for WhatsApp to show. Made by build/thumbs.js. */
  const OG_SIZE = { width: 1200, height: 630 };
  function ogName(url){
    return urlHash(url) + "-og.jpg";
  }

  function resized(url, width, root){
    return /^https?:\/\//i.test(url) ? (root || "") + THUMB_DIR + thumbName(url, width) : url;
  }

  function slugify(v){
    return clean(v).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g,"")
      .replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  }

  const POST_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /* A post body as plain words: the formatting marks build/blog.js
     understands (## headings, - lists, **bold**, [text](link)) removed. */
  function articleText(body){
    return clean(body)
      .replace(/^\s*(?:#{1,3}|[-*•]|\d+[.)])\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\s+/g, " ").trim();
  }

  function shorten(text, max){
    return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,.;:!?-]+$/, "") + "…" : text;
  }

  /* ---------------- NORMALISE ---------------- */

  function normalizeProject(row, opts){
    const supabaseUrl = (opts && opts.supabaseUrl) || "";
    const root = (opts && opts.root) || "";
    /* Commercial rows say so through opts.kind (or a kind the caller
       stamped on the row). */
    const K = kindOf((opts && opts.kind) || row.__kind);
    const commercial = K.kind === "commercial";
    const withCopies = item => Object.assign(item, {
      large: resized(item.url, IMAGE_WIDTHS.large, root),
      small: resized(item.url, IMAGE_WIDTHS.small, root),
      card: resized(item.url, 0, root)
    });
    const mediaUrl = m => clean(m.media_url) || storagePublicUrl(supabaseUrl, m.storage_bucket, m.media_path);

    const media = list(row.media).filter(m => m.is_active !== false);
    const pick = type => media.filter(m => m.media_type === type);
    const main = pick("main_image").sort((a,b) => (b.is_primary === true) - (a.is_primary === true));

    const images = [];
    const pushImage = (url, alt) => {
      if(url && !images.some(i => i.url === url)) images.push(withCopies({ url, alt: clean(alt) }));
    };
    main.forEach(m => pushImage(mediaUrl(m), m.alt_text));
    pushImage(storagePublicUrl(supabaseUrl, row.main_image_bucket, row.main_image_path), "");
    pick("gallery").forEach(m => pushImage(mediaUrl(m), m.alt_text || m.title));

    const masterPlans = pick("master_plan").map(m => ({ url: mediaUrl(m), title: clean(m.title) || "Master Plan", alt: clean(m.alt_text) })).filter(m => m.url).map(withCopies);
    const videos = media.filter(m => ["video","virtual_tour","reel"].includes(m.media_type))
      .map(m => ({ url: mediaUrl(m), type: m.media_type, title: clean(m.title), platform: clean(m.platform),
        description: clean(m.description), date: m.created_at || "" }))
      .filter(v => v.url);

    const priceOnRequest = row.price_on_request === true;

    /* Residential configurations, or commercial units (same idea: one
       row per kind of unit, with its area, price and availability). */
    const configurations = list(commercial ? row.units : row.configurations).map(c => {
      /* A unit offered on rent quotes a monthly figure: either the
         price itself (price_type monthly_rent) or expected_rent. */
      const rentOnly = commercial && (c.price_type === "monthly_rent" || (!(Number(c.starting_price) > 0) && Number(c.expected_rent) > 0));
      const from = rentOnly ? Number(c.price_type === "monthly_rent" ? c.starting_price : c.expected_rent) : Number(c.starting_price);
      const to = rentOnly && c.price_type !== "monthly_rent" ? 0 : Number(c.maximum_price);
      const onRequest = priceOnRequest || c.price_on_request === true;
      const perUnit = c.price_type === "price_per_sq_ft" ? " / Sq.Ft" : c.price_type === "price_per_sq_m" ? " / Sq.M"
        : rentOnly ? " / month" : "";
      let price = "On Request";
      if(!onRequest && from > 0){
        price = formatPrice(from) + (to > from ? " – " + formatPrice(to) : "") + perUnit;
      }
      const rent = commercial && !rentOnly && Number(c.expected_rent) > 0 ? formatPrice(c.expected_rent) + " / month" : "";
      const area = Number(c.carpet_area);
      /* Price per sq ft: quoted directly for per-sq-ft pricing, otherwise
         the starting price over the carpet area (sq m converted). */
      const sqft = area > 0 ? (c.area_unit === "sq_m" ? area * SQFT_PER_SQM : area) : 0;
      let rate = null;
      if(!onRequest && from > 0 && !rentOnly){
        if(c.price_type === "price_per_sq_ft") rate = from;
        else if(c.price_type === "price_per_sq_m") rate = from / SQFT_PER_SQM;
        else if(sqft > 0) rate = from / sqft;
      }
      return {
        bhk: commercial ? titleCase(c.unit_type) : normaliseBhk(c.bhk_type),
        variant: commercial ? [clean(c.variant_name), floorLabel(c.floor_level)].filter(Boolean).join(" · ") : clean(c.variant_name),
        rent,
        rentOnly,
        rentValue: rentOnly && !onRequest && from > 0 ? from : null,
        /* Only worth saying when it differs from the whole project's. */
        transaction: commercial && clean(c.transaction_type) && c.transaction_type !== row.transaction_type ? codeLabel(c.transaction_type, TRANSACTION_LABELS) : "",
        furnishing: commercial && clean(c.furnishing) ? codeLabel(c.furnishing, FURNISHING_LABELS) : "",
        washroom: commercial && clean(c.washroom) && c.washroom !== "none" ? titleCase(c.washroom) + " washroom" : "",
        pantry: commercial && c.pantry === true ? "Pantry" : "",
        price,
        priceValue: !onRequest && from > 0 && !perUnit ? from : null,
        area: area > 0 ? formatNumber(area) + " " + (c.area_unit === "sq_m" ? "Sq.M" : "Sq.Ft") : "",
        availability: AVAILABILITY_LABELS[c.availability] || "Available",
        soldOut: c.availability === "sold_out" || c.availability === "leased_out",
        /* For structured data: the top of the price range, and the
           carpet area as a number with its UN/CEFACT unit code. */
        priceMaxValue: !onRequest && from > 0 && !perUnit ? (to > from ? to : from) : null,
        areaValue: area > 0 ? area : null,
        areaUnitCode: c.area_unit === "sq_m" ? "MTK" : "FTK",
        rate: rate ? Math.round(rate / 10) * 10 : null,
        rateText: rate ? formatRate(rate) : "",
        builtUp: Number(c.built_up_area) > 0 ? formatNumber(c.built_up_area) + " " + (c.area_unit === "sq_m" ? "Sq.M" : "Sq.Ft") : "",
        superBuiltUp: Number(c.super_built_up_area) > 0 ? formatNumber(c.super_built_up_area) + " " + (c.area_unit === "sq_m" ? "Sq.M" : "Sq.Ft") : "",
        /* "Included · Covered, Open"; "Not available" on its own. */
        parking: !clean(c.parking_included) ? ""
          : c.parking_included === "not_available" ? PARKING_LABELS.not_available
          : [codeLabel(c.parking_included, PARKING_LABELS), (c.parking_type || []).map(t => codeLabel(t)).join(", ")].filter(Boolean).join(" · ")
      };
    });

    const rates = configurations.map(c => c.rate).filter(Boolean);
    const rateMin = rates.length ? Math.min(...rates) : null;
    const rateMax = rates.length ? Math.max(...rates) : null;
    const rateRange = rateMin === null ? ""
      : rateMax > rateMin ? `₹ ${formatNumber(rateMin)} – ${formatNumber(rateMax)} / Sq.Ft` : formatRate(rateMin);

    const bhkLabels = [...new Set(configurations.map(c => c.bhk).filter(Boolean))];
    const prices = configurations.map(c => c.priceValue).filter(Boolean);
    const projectFrom = Number(row.starting_price);
    const startingPrice = priceOnRequest ? null
      : (prices.length ? Math.min(...prices) : (projectFrom > 0 ? projectFrom : null));
    const rents = configurations.map(c => c.rentValue).filter(Boolean);
    const startingRent = priceOnRequest || startingPrice || !rents.length ? null : Math.min(...rents);

    const statusKey = row.status;
    const city = row.city ? titleCase(row.city.name) : "";
    const locality = row.locality ? titleCase(row.locality.name) : "";
    const state = row.city ? titleCase(row.city.state) : "";
    const name = titleCase(row.project_name) || (commercial ? "Commercial Project" : "Residential Project");
    const typeLabel = commercial
      ? COMMERCIAL_TYPE_LABELS[row.project_type] || "Commercial Project"
      : PROJECT_TYPE_LABELS[row.project_type] || "Residential Project";

    const amenities = list(row.amenities)
      .filter(a => a.is_available !== false && clean(a.amenity_name))
      .map(a => ({ name: clean(a.amenity_name), category: AMENITY_CATEGORY_LABELS[a.category] || "Other" }));

    const nearby = list(row.nearby).filter(n => clean(n.name)).map(n => ({
      name: clean(n.name),
      type: clean(n.location_type) || NEARBY_CATEGORY_LABELS[n.category] || "",
      distance: Number(n.distance) > 0 ? formatNumber(n.distance) + " " + (n.distance_unit === "m" ? "m" : "km") : ""
    }));

    const faqs = list(row.faqs).filter(f => f.is_published !== false && clean(f.question) && clean(f.answer))
      .map(f => ({ question: clean(f.question), answer: clean(f.answer) }));

    const prosCons = list(row.pros_cons).filter(p => p.is_published !== false && clean(p.content));
    const pros = prosCons.filter(p => p.item_type === "pro").map(p => clean(p.content));
    const cons = prosCons.filter(p => p.item_type === "con").map(p => clean(p.content));

    /* Each published post has its own page at
       projects/<project>/blog/<post>/ (build/blog.js). The project
       page lists them as cards that link there. */
    const postSlugs = new Set();
    const blogs = list(row.blogs).filter(b => b.is_published === true && clean(b.title) && clean(b.body)).map(b => {
      const body = clean(b.body).replace(/\r\n?/g, "\n");
      const flat = articleText(body);
      /* The card excerpt skips headings so it reads as one passage. */
      const lead = articleText(body.replace(/^\s*#{1,3}\s+.*$/gm, ""));
      let slug = POST_SLUG_RE.test(clean(b.slug)) ? clean(b.slug) : slugify(b.title) || "post";
      for(let n = 2; postSlugs.has(slug); n++) slug = slug.replace(/-\d+$/, "") + "-" + n;
      postSlugs.add(slug);
      const path = K.base + "/" + row.slug + "/blog/" + slug + "/";
      return {
        title: clean(b.title),
        slug,
        path,
        href: root + path,
        excerpt: clean(b.excerpt) || shorten(lead, 180),
        description: clean(b.meta_description) || clean(b.excerpt) || lead,
        body,
        words: flat.split(/\s+/).filter(Boolean).length,
        image: clean(b.cover_image_url) || storagePublicUrl(supabaseUrl, b.storage_bucket, b.cover_image_path),
        indexable: flat.split(/\s+/).filter(Boolean).length >= MIN_INDEXED_WORDS,
        author: clean(b.author),
        tags: (b.tags || []).map(clean).filter(Boolean),
        date: b.published_at || b.created_at || "",
        updated: b.updated_at || b.published_at || b.created_at || ""
      };
    });

    blogs.forEach(b => {
      b.cover = b.image ? { large: resized(b.image, IMAGE_WIDTHS.large, root), card: resized(b.image, 0, root) } : null;
    });

    const floorPlans = list(row.floor_plans).filter(f => f.is_active !== false).map(f => ({
      url: clean(f.image_url) || storagePublicUrl(supabaseUrl, f.storage_bucket, f.image_path),
      title: clean(f.title) || normaliseBhk(f.bhk_type) || "Floor Plan",
      bhk: normaliseBhk(f.bhk_type),
      alt: clean(f.alt_text)
    })).filter(f => f.url).map(withCopies);

    const towers = list(row.towers).filter(t => clean(t.tower_name)).map(t => ({
      name: clean(t.tower_name),
      floors: t.number_of_floors || "",
      units: t.number_of_units || "",
      configurations: (t.configurations || []).map(normaliseBhk).filter(Boolean).join(", "),
      status: [
        STATUS_LABELS[t.tower_status] || titleCase(String(t.tower_status || "").replace(/_/g," ")),
        clean(t.construction_stage) && t.construction_stage !== t.tower_status ? codeLabel(t.construction_stage) : "",
        t.expected_completion_date ? "Completion " + formatMonthYear(t.expected_completion_date) : ""
      ].filter(Boolean).join(" · ")
    }));

    const phases = list(row.phases).filter(ph => clean(ph.phase_name)).map(ph => ({
      name: /^\d+$/.test(clean(ph.phase_name)) ? "Phase " + clean(ph.phase_name) : titleCase(ph.phase_name),
      configurations: (ph.configurations || []).map(normaliseBhk).filter(Boolean)
        .sort((a, b) => parseFloat(a) - parseFloat(b)).join(", "),
      units: Number(ph.units_per_phase) > 0 ? formatNumber(ph.units_per_phase) : "",
      start: formatMonthYear(ph.construction_start_date),
      completion: formatMonthYear(ph.expected_completion_date),
      possession: formatMonthYear(ph.target_possession_date),
      reraPossession: formatMonthYear(ph.rera_possession_date)
    }));

    /* Construction progress, newest first, with its photos. */
    const updates = (Array.isArray(row.updates) ? row.updates : [])
      .filter(u => u.is_published !== false && clean(u.update_title))
      .sort((a, b) => String(b.update_date || "").localeCompare(String(a.update_date || "")) || byOrder(a, b))
      .map(u => ({
        title: clean(u.update_title),
        date: formatDate(u.update_date),
        isoDate: clean(u.update_date),
        stage: clean(u.construction_stage) ? codeLabel(u.construction_stage) : "",
        description: clean(u.description),
        photos: list(u.media).map(m => ({
          url: clean(m.media_url) || storagePublicUrl(supabaseUrl, m.storage_bucket, m.media_path),
          alt: clean(m.alt_text) || clean(m.caption) || `${titleCase(row.project_name)} construction - ${clean(u.update_title)}`,
          caption: clean(m.caption)
        })).filter(m => m.url).map(withCopies)
      }));

    /* Public documents only. The files sit in a private bucket, so the
       page lists what is available and buyers request a copy. */
    const documents = list(row.documents)
      .filter(d => d.visibility === "public" && (clean(d.title) || clean(d.document_type)))
      .map(d => ({ type: codeLabel(d.document_type, DOCUMENT_TYPE_LABELS), title: clean(d.title), description: clean(d.description) }));

    /* Litigation as entered in the admin. "Information not available"
       is not shown (the database policy hides it from visitors too). */
    const litigation = list(row.litigation)
      .filter(l => clean(l.status) && l.status !== "information_not_available")
      .map(l => ({
        status: codeLabel(l.status, LITIGATION_LABELS),
        reported: l.status === "litigation_reported",
        title: clean(l.case_title),
        reference: clean(l.case_reference_number),
        court: clean(l.court_tribunal),
        type: clean(l.case_type),
        current: clean(l.current_status),
        filed: formatDate(l.filing_date),
        lastHearing: formatDate(l.latest_hearing_date),
        nextHearing: formatDate(l.next_hearing_date),
        source: /^https?:\/\//i.test(clean(l.source_reference_url)) ? clean(l.source_reference_url) : ""
      }));

    /* Every RERA number the project lists (one per phase, often). */
    const reraNumbers = [clean(row.rera_number), ...(row.rera_numbers || []).map(clean)]
      .filter((v, i, a) => v && a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);

    const specifications = (commercial ? COMMERCIAL_SPEC_FIELDS : SPEC_FIELDS)
      .map(([key,label]) => ({ label, value: clean(row[key]) })).filter(s => s.value);

    const facts = [];
    const addFact = (label, value) => { if(clean(value)) facts.push({ label, value: clean(value) }); };
    addFact("Price / Sq.Ft", rateRange);
    if(Number(row.total_land_area) > 0) addFact("Land Area", formatNumber(row.total_land_area) + " " + (UNIT_LABELS[row.land_area_unit] || ""));
    addFact("Towers", row.total_towers_buildings);
    addFact("Floors", row.total_floors);
    addFact("Total Units", commercial ? row.total_commercial_units : row.total_residential_units);
    if(commercial){
      const areaUnit = UNIT_LABELS[row.area_unit] || "Sq.Ft";
      const area = v => Number(v) > 0 ? formatNumber(v) + " " + areaUnit : "";
      addFact("Leasable Area", area(row.total_leasable_area));
      addFact("Saleable Area", area(row.total_saleable_area));
      addFact("Typical Floor Plate", area(row.typical_floor_plate));
      addFact("Occupancy Certificate", clean(row.occupancy_certificate) ? codeLabel(row.occupancy_certificate, OC_LABELS) : "");
      addFact("Maintenance Charges", Number(row.maintenance_charges) > 0 ? "₹ " + formatNumber(row.maintenance_charges) : "");
      addFact("Security Deposit", Number(row.security_deposit_months) > 0 ? formatNumber(row.security_deposit_months) + " months' rent" : "");
      addFact("Lock-in Period", Number(row.lock_in_period_months) > 0 ? row.lock_in_period_months + " months" : "");
      addFact("Rent Escalation", Number(row.rent_escalation_percent) > 0 ? formatNumber(row.rent_escalation_percent) + "% a year" : "");
    }
    if(Number(row.open_green_area_value) > 0) addFact("Open Green Area", formatNumber(row.open_green_area_value) + " " + (UNIT_LABELS[row.open_green_area_unit] || ""));
    if(Number(row.built_up_project_area) > 0) addFact("Built-up Area", formatNumber(row.built_up_project_area) + " " + (UNIT_LABELS[row.built_up_project_area_unit] || ""));
    addFact("Units per Floor", Number(row.units_per_floor) > 0 ? formatNumber(row.units_per_floor) : "");
    addFact("Phases", row.number_of_phases);
    addFact("Current Phase", /^\d+$/.test(clean(row.project_phase)) ? "Phase " + clean(row.project_phase) : titleCase(row.project_phase));
    addFact("Launch Date", formatMonthYear(row.launch_date));
    addFact("Construction Start", formatMonthYear(row.construction_start_date));
    addFact("Expected Completion", formatMonthYear(row.expected_completion_date));
    addFact("RERA Possession", formatMonthYear(row.rera_possession_date));
    if(reraNumbers.length > 1) addFact("RERA Numbers", reraNumbers.join(", "));

    const agent = row.agent || null;
    const developer = row.developer || null;

    return {
      id: row.id,
      slug: row.slug,
      kind: K.kind,
      basePath: K.base,
      name,
      typeLabel,
      transactionLabel: commercial && clean(row.transaction_type) ? codeLabel(row.transaction_type, TRANSACTION_LABELS) : "",
      forSale: !commercial || row.transaction_type !== "lease",
      statusKey: statusKey || "",
      status: STATUS_LABELS[statusKey] || "",
      statusClass: statusKey ? "st-" + String(statusKey).replace(/_/g, "-") : "",
      city, locality, state,
      location: [locality, city, state].filter((v,i,a) => v && a.indexOf(v) === i).join(", "),
      address: clean(row.address),
      pincode: clean(row.pincode),
      latitude: row.latitude, longitude: row.longitude,
      developer: developer ? titleCase(developer.name) : "",
      developerDescription: developer ? clean(developer.description) : "",
      developerLogo: developer ? clean(developer.logo_url) : "",
      contactPhone: agent ? clean(agent.phone).replace(/[^\d+]/g,"") : "",
      contactWhatsapp: agent ? clean(agent.whatsapp || agent.phone).replace(/\D/g,"") : "",
      rera: reraNumbers[0] || "",
      reraNumbers,
      possession: formatMonthYear(row.target_possession_date || row.rera_possession_date),
      overview: clean(row.overview),
      highlights: (row.highlights || []).map(clean).filter(Boolean),
      startingPrice,
      /* Lease-only commercial projects quote a monthly rent instead. */
      startingRent,
      startingPriceText: startingPrice ? formatPrice(startingPrice)
        : startingRent ? formatPrice(startingRent) + " / month" : "Price on Request",
      priceDisclaimer: clean(row.price_disclaimer),
      bhkLabels,
      /* The same list under a kind-neutral name: BHK sizes for homes,
         unit types (Office Space, Shop...) for commercial. */
      configLabels: bhkLabels,
      firstArea: (configurations.find(c => c.area) || {}).area || "",
      configurations,
      images,
      masterPlans,
      videos,
      amenities,
      nearby,
      faqs,
      pros, cons,
      blogs,
      floorPlans,
      towers,
      phases,
      updates,
      documents,
      litigation,
      specifications,
      facts,
      seoTitle: clean(row.seo_title),
      seoDescription: clean(row.seo_description),
      views: Number(row.view_count) || 0,
      publishedAt: row.published_at || row.created_at,
      /* Price edits live in configurations, so they count too. */
      updatedAt: latest([row.updated_at, ...list(row.configurations).map(c => c.updated_at)]) || row.published_at || row.created_at,
      pricesUpdatedText: (() => {
        const priced = list(row.configurations).map(c => c.updated_at).filter(Boolean);
        return startingPrice ? formatMonthYear(latest(priced.length ? priced : [row.updated_at])) : "";
      })()
    };
  }

  /* ---------------- SEO TEXT ---------------- */

  /* Google shows about 60 characters of a title. */
  const TITLE_MAX = 65;
  const DESCRIPTION_MAX = 160;

  /* The first option that fits, else the shortest. */
  function fitText(options, max){
    const list = options.filter(Boolean);
    return list.find(t => t.length <= max) || list.reduce((a, b) => b.length < a.length ? b : a);
  }

  /* "A | B | C | Keys99": drops middle parts from the right until it fits. */
  function fitTitle(title){
    const parts = String(title).split(" | ");
    const options = [title];
    for(let n = parts.length - 2; n >= 1; n--) options.push([...parts.slice(0, n), parts[parts.length - 1]].join(" | "));
    return fitText(options, TITLE_MAX);
  }

  function pageTitle(p){
    /* The admin's own title wins; the brand is added when it fits, as
       Google shows it in results and it helps people recognise the site. */
    if(p.seoTitle){
      const branded = `${p.seoTitle} | Keys99`;
      return /keys99/i.test(p.seoTitle) || branded.length > TITLE_MAX ? p.seoTitle : branded;
    }
    const where = [p.locality, p.city].filter(Boolean).join(", ");
    const head = `${p.name}${where ? " " + where : ""}`;
    /* The starting price is what buyers scan results for, so the
       versions with it come first. */
    const price = p.startingPrice || p.startingRent ? ` from ${p.startingPriceText}` : "";
    if(p.kind === "commercial"){
      /* "Office Space & Shop for Sale from ₹ 1.2 Cr" */
      const units = p.configLabels.length ? joinList(p.configLabels, 3) : p.typeLabel;
      const deal = p.transactionLabel ? " " + p.transactionLabel.replace(/^For /, "for ") : "";
      return fitText([
        price && `${head} | ${units}${deal}${price} | Keys99`,
        price && `${head} | ${p.typeLabel}${deal}${price} | Keys99`,
        `${head} | ${units}${deal}${p.developer ? " by " + p.developer : ""} | Keys99`,
        `${head} | ${p.typeLabel}${deal} | Keys99`,
        `${head} | Keys99`,
        `${p.name}${p.city ? " " + p.city : ""} | Keys99`
      ], TITLE_MAX);
    }
    const bhk = p.bhkLabels.length ? p.bhkLabels.join(", ") + " " : "";
    return fitText([
      price && `${head} - ${bhk}${p.typeLabel}${price} | Keys99`,
      price && `${head} | ${bhk ? bhk + "Flats" : p.typeLabel}${price} | Keys99`,
      `${head} - ${bhk}${p.typeLabel}${p.developer ? " by " + p.developer : ""} | Keys99`,
      `${head} - ${bhk}${p.typeLabel} | Keys99`,
      `${head} | ${bhk ? bhk + "Flats" : p.typeLabel} | Keys99`,
      `${head} | Keys99`,
      `${p.name}${p.city ? " " + p.city : ""} | Keys99`
    ], TITLE_MAX);
  }

  function pageDescription(p){
    if(p.seoDescription) return p.seoDescription;
    const commercial = p.kind === "commercial";
    const offers = !p.configLabels.length ? ""
      : commercial ? `offers ${joinList(p.configLabels, 4)}${p.transactionLabel ? " " + p.transactionLabel.toLowerCase() : ""}`
      : `offers ${p.bhkLabels.join(", ")} ${p.typeLabel.toLowerCase()}s`;
    const parts = [
      `${p.name}${p.locality ? " in " + p.locality : ""}${p.city ? ", " + p.city : ""}`,
      p.developer ? `by ${p.developer}` : "",
      offers,
      p.startingPrice || p.startingRent ? `from ${p.startingPriceText}` : "",
    ].filter(Boolean).join(" ");
    const tail = [p.status, p.possession ? "possession " + p.possession : "", p.rera ? "RERA " + p.rera : ""].filter(Boolean).join(", ");
    const close = commercial ? " Photos, unit sizes, amenities and price on Keys99."
      : " Photos, floor plans, amenities and price on Keys99.";
    /* Longest version that fits in Google's snippet. */
    return fitText([
      parts + "." + (tail ? " " + tail + "." : "") + close,
      parts + "." + (p.status ? " " + p.status + "." : "") + close,
      parts + "." + close,
      parts + "."
    ], DESCRIPTION_MAX);
  }

  /* ---------------- SECTION RENDERERS (HTML strings) ---------------- */

  function renderConfigurationRows(p){
    return p.configurations.map(c => `
      <tr>
        <td>${escapeHtml(c.bhk)}${c.variant ? ` <small>${escapeHtml(c.variant)}</small>` : ""}</td>
        <td>${escapeHtml(c.price)}${c.rateText && !/\/ Sq/.test(c.price) ? `<small class="config-rate">${escapeHtml(c.rateText)}</small>` : ""}${c.rent ? `<small class="config-rate">Rent ${escapeHtml(c.rent)}</small>` : ""}${c.transaction ? `<small>${escapeHtml(c.transaction)}</small>` : ""}</td>
        <td>${escapeHtml(c.area || "—")}${c.builtUp ? `<small class="config-rate">Built-up ${escapeHtml(c.builtUp)}</small>` : ""}${c.superBuiltUp ? `<small class="config-rate">Super built-up ${escapeHtml(c.superBuiltUp)}</small>` : ""}</td>
        <td>${p.kind === "commercial"
          ? escapeHtml(c.furnishing || "—") + [c.washroom, c.pantry, c.parking ? "Parking: " + c.parking : ""].filter(Boolean).map(x => `<small>${escapeHtml(x)}</small>`).join("")
          : escapeHtml(c.parking || "—")}</td>
        <td><span class="status-pill status-${c.soldOut ? "sold" : "available"}">${escapeHtml(c.availability)}</span></td>
      </tr>`).join("");
  }

  function renderHighlights(p){
    return p.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("");
  }

  function renderFacts(p){
    return p.facts.map(f => `
      <div class="fact"><small>${escapeHtml(f.label)}</small><strong>${escapeHtml(f.value)}</strong></div>`).join("");
  }

  function renderAmenities(p){
    return p.amenities.map(a => `<div class="amenity" title="${escapeHtml(a.category)}">${escapeHtml(a.name)}</div>`).join("");
  }

  function renderNearbyRows(p){
    return p.nearby.map(n => `
      <tr>
        <td>${escapeHtml(n.name)}${n.type ? ` <small>${escapeHtml(n.type)}</small>` : ""}</td>
        <td>${escapeHtml(n.distance)}</td>
      </tr>`).join("");
  }

  function renderSpecificationRows(p){
    return p.specifications.map(s => `
      <tr><th scope="row">${escapeHtml(s.label)}</th><td>${escapeHtml(s.value)}</td></tr>`).join("");
  }

  function renderTowerRows(p){
    return p.towers.map(t => `
      <tr>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.floors || "—")}</td>
        <td>${escapeHtml(t.units || "—")}</td>
        <td>${escapeHtml(t.configurations || "—")}</td>
        <td>${escapeHtml(t.status)}</td>
      </tr>`).join("");
  }

  function renderPhaseRows(p){
    return p.phases.map(ph => `
      <tr>
        <td>${escapeHtml(ph.name)}${ph.units ? ` <small>${escapeHtml(ph.units)} units</small>` : ""}</td>
        <td>${escapeHtml(ph.configurations || "—")}</td>
        <td>${escapeHtml(ph.start || "—")}</td>
        <td>${escapeHtml(ph.completion || "—")}</td>
        <td>${escapeHtml(ph.possession || ph.reraPossession || "—")}${ph.reraPossession && ph.possession ? `<small>RERA ${escapeHtml(ph.reraPossession)}</small>` : ""}</td>
      </tr>`).join("");
  }

  function renderUpdates(p){
    return p.updates.map(u => `
      <article class="update-item">
        <div class="update-head">
          ${u.date ? `<time datetime="${escapeHtml(u.isoDate)}">${escapeHtml(u.date)}</time>` : ""}
          ${u.stage ? `<span class="update-stage">${escapeHtml(u.stage)}</span>` : ""}
        </div>
        <h3>${escapeHtml(u.title)}</h3>
        ${u.description ? `<p>${escapeHtml(u.description)}</p>` : ""}
        ${u.photos.length ? `<div class="update-photos">${u.photos.map(ph => `
          <figure><img src="${escapeHtml(ph.small)}" data-full="${escapeHtml(ph.url)}" onerror="${IMG_FALLBACK}" alt="${escapeHtml(ph.alt)}" loading="lazy" decoding="async">${ph.caption ? `<figcaption>${escapeHtml(ph.caption)}</figcaption>` : ""}</figure>`).join("")}</div>` : ""}
      </article>`).join("");
  }

  /* RERA numbers, public documents and litigation status: the checks a
     buyer makes before paying a booking amount. */
  function renderLegal(p){
    const parts = [];
    if(p.reraNumbers.length){
      parts.push(`
      <div class="legal-block">
        <h3>RERA Registration</h3>
        <ul class="legal-list">${p.reraNumbers.map(r => `<li><strong>${escapeHtml(r)}</strong></li>`).join("")}</ul>
        <p class="legal-note">Check ${p.reraNumbers.length === 1 ? "this number" : "these numbers"} on your state's RERA portal before you pay a booking amount.</p>
      </div>`);
    }
    if(p.documents.length){
      parts.push(`
      <div class="legal-block">
        <h3>Documents</h3>
        <ul class="legal-list">${p.documents.map(d => `
          <li><span class="doc-type">${escapeHtml(d.type)}</span>${d.title && d.title.toLowerCase() !== d.type.toLowerCase() ? ` ${escapeHtml(d.title)}` : ""}${d.description ? `<small>${escapeHtml(d.description)}</small>` : ""}</li>`).join("")}</ul>
        <a class="doc-request" href="#enquiryWrap">Request a copy →</a>
      </div>`);
    }
    if(p.litigation.length){
      parts.push(`
      <div class="legal-block">
        <h3>Litigation Status</h3>
        ${p.litigation.map(l => {
          const rows = [["Case", l.title], ["Reference", l.reference], ["Court / Tribunal", l.court], ["Case Type", l.type],
            ["Current Status", l.current], ["Filed", l.filed], ["Last Hearing", l.lastHearing], ["Next Hearing", l.nextHearing]]
            .filter(([, v]) => v);
          return `
        <div class="litigation-item">
          <span class="legal-status ${l.reported ? "is-reported" : "is-clear"}">${escapeHtml(l.status)}</span>
          ${l.reported && rows.length ? `<dl class="legal-facts">${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` : ""}
          ${l.source ? `<a class="legal-source" href="${escapeHtml(l.source)}" target="_blank" rel="noopener noreferrer nofollow">View source ↗</a>` : ""}
        </div>`;
        }).join("")}
      </div>`);
    }
    return parts.join("");
  }

  function renderProsCons(p){
    const col = (title, items, cls) => items.length ? `
      <div class="pc-col ${cls}">
        <h3>${title}</h3>
        <ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      </div>` : "";
    return col("Pros", p.pros, "pros") + col("Cons", p.cons, "cons");
  }

  function renderFaqs(p){
    return p.faqs.map(f => `
      <details class="faq-item">
        <summary>${escapeHtml(f.question)}</summary>
        <p>${escapeHtml(f.answer)}</p>
      </details>`).join("");
  }

  /* Each card is one link to the post's own page, so search engines
     follow it and the post links back to the project. */
  function renderBlogs(p){
    return p.blogs.map(b => {
      const d = b.date ? new Date(b.date) : null;
      const day = d && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
      const meta = [
        b.author ? escapeHtml(b.author) : "",
        day ? `<time datetime="${day}">${escapeHtml(formatDay(day))}</time>` : "",
        Math.max(1, Math.round(b.words / 200)) + " min read"
      ].filter(Boolean).join(" · ");
      return `
      <a class="project-blog" href="${escapeHtml(b.href)}">
        ${b.cover ? `<img class="project-blog-cover" src="${escapeHtml(b.cover.card)}" data-full="${escapeHtml(b.image)}" onerror="${COVER_FALLBACK}" alt="${escapeHtml(b.title)}" width="640" height="480" loading="lazy" decoding="async">` : ""}
        <span class="project-blog-text">
          ${b.tags.length ? `<span class="project-blog-tags">${b.tags.map(t => `<span>${escapeHtml(t)}</span>`).join("")}</span>` : ""}
          <h3>${escapeHtml(b.title)}</h3>
          <span class="project-blog-meta">${meta}</span>
          <span class="project-blog-excerpt">${escapeHtml(b.excerpt)}</span>
          <span class="project-blog-more">Read full article</span>
        </span>
      </a>`;
    }).join("");
  }

  function formatDay(day){
    return new Date(day + "T00:00:00Z").toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric", timeZone:"UTC" });
  }

  function renderFloorPlans(p){
    return [...p.floorPlans, ...p.masterPlans].map(f => `
      <figure class="floor-plan-card">
        <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(f.title)} at full size">
          <img src="${escapeHtml(f.large)}" data-full="${escapeHtml(f.url)}" onerror="${IMG_FALLBACK}" alt="${escapeHtml(f.alt || p.name + " " + f.title)}" loading="lazy" decoding="async">
        </a>
        <figcaption>${escapeHtml(f.title)}</figcaption>
      </figure>`).join("");
  }

  function renderThumbs(p){
    return p.images.map((img, i) => `
      <button type="button" class="gallery-thumb${i === 0 ? " active" : ""}" data-index="${i}" aria-label="View image ${i + 1}">
        <img src="${escapeHtml(img.small)}" data-full="${escapeHtml(img.url)}" onerror="${IMG_FALLBACK}" alt="${escapeHtml(img.alt || p.name + " image " + (i + 1))}" loading="lazy" decoding="async">
      </button>`).join("");
  }

  /* ---------------- SIMILAR PROJECTS ----------------
     Other published projects a buyer looking at this one would also
     consider: same locality first, then same city, sharing BHK sizes,
     at a similar price. Built into the page by build/generate.js. */

  function pickSimilar(p, all, limit){
    const lower = v => clean(v).toLowerCase();
    const bhks = new Set(p.bhkLabels);
    return all
      /* Like for like: homes are compared with homes, offices and
         shops with commercial projects. */
      .filter(o => (o.kind || "residential") === (p.kind || "residential"))
      .filter(o => o.slug !== p.slug && lower(o.name) !== lower(p.name))
      .map(o => {
        let score = 0;
        if(p.locality && lower(o.locality) === lower(p.locality) && lower(o.city) === lower(p.city)) score += 4;
        else if(p.city && lower(o.city) === lower(p.city)) score += 2;
        score += Math.min(2, o.bhkLabels.filter(b => bhks.has(b)).length);
        if(p.startingPrice && o.startingPrice && Math.abs(o.startingPrice - p.startingPrice) <= p.startingPrice * 0.3) score += 1;
        return { o, score };
      })
      .filter(x => x.score >= 2)
      .sort((a, b) => b.score - a.score || String(b.o.publishedAt || "").localeCompare(String(a.o.publishedAt || "")))
      .slice(0, limit || 4)
      .map(x => x.o);
  }

  /* ---------------- VIDEOS ----------------
     What the Reels page needs to show a video: where it is hosted, a
     player URL, a thumbnail, and whether it is a tall short. */
  function videoInfo(url){
    const info = { url, platform: "other", embed: "", thumb: "", tall: false };
    let u;
    try{ u = new URL(url); }catch(_){ return info; }
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if(/(^|\.)youtube\.com$|^youtu\.be$/.test(host)){
      let id = host === "youtu.be" ? parts[0] : u.searchParams.get("v");
      const i = parts.findIndex(x => ["shorts", "embed", "live"].includes(x));
      if(!id && i >= 0) id = parts[i + 1];
      if(id && /^[\w-]{6,20}$/.test(id)){
        info.platform = "youtube";
        info.embed = `https://www.youtube.com/embed/${id}?rel=0&autoplay=1`;
        info.thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        info.tall = parts[0] === "shorts";
      }
    }else if(/(^|\.)instagram\.com$/.test(host)){
      const i = parts.findIndex(x => ["p", "reel", "reels", "tv"].includes(x));
      if(i >= 0 && parts[i + 1]){
        info.platform = "instagram";
        info.embed = `https://www.instagram.com/${parts[i] === "reels" ? "reel" : parts[i]}/${encodeURIComponent(parts[i + 1])}/embed/`;
        info.tall = true;
      }
    }else if(/(^|\.)facebook\.com$|^fb\.watch$/.test(host)){
      info.platform = "facebook";
      info.embed = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=1`;
    }else if(/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url) || /supabase\.co\/storage\//i.test(url)){
      info.platform = "file";
    }
    return info;
  }

  /* The "Property Videos" section as plain HTML, for build/generate.js:
     each video's title, a thumbnail and a link, so crawlers that do not
     run JavaScript still see what the videos are. In the browser,
     renderMedia() in js/property-details.js swaps in the players.
     Same split as renderMedia(): uploaded files vs hosted videos. */
  function renderVideos(p){
    const labels = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram" };
    const uploaded = [], social = [];
    p.videos.forEach(v => {
      const info = videoInfo(v.url);
      const label = labels[info.platform] || "Video";
      const title = v.title || (v.type === "virtual_tour" ? "Virtual Tour" : info.platform === "file" ? "Project Video" : label + " Video");
      if(info.platform === "file"){
        uploaded.push(`
          <div class="video-card"><video controls playsinline preload="none"><source src="${escapeHtml(v.url)}"></video>
            <div class="media-caption">${escapeHtml(title)}</div></div>`);
        return;
      }
      const thumb = info.thumb
        ? `<a class="social-thumb" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(info.thumb)}" alt="${escapeHtml(p.name + " - " + title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
        : "";
      social.push(`
          <div class="social-card ${escapeHtml(info.platform === "other" ? "" : info.platform)}"><div class="social-head"><span>▶</span>${escapeHtml(title)}</div>${thumb}
            <div class="social-footer"><a href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(label)} ↗</a></div></div>`);
    });
    return { uploaded: uploaded.join(""), social: social.join("") };
  }

  /* ---------------- STRUCTURED DATA ---------------- */

  function structuredData(p, pageUrl, siteUrl){
    const graph = [];

    const place = {
      /* Homes: an apartment complex. Offices, shops and the like have
         no closer schema.org type than a place. */
      "@type": p.kind === "commercial" ? "Place" : "ApartmentComplex",
      "@id": pageUrl + "#project",
      name: p.name,
      url: pageUrl,
      description: p.overview || pageDescription(p),
      address: {
        "@type": "PostalAddress",
        streetAddress: p.address || undefined,
        addressLocality: p.locality || p.city || undefined,
        addressRegion: p.state || undefined,
        postalCode: p.pincode || undefined,
        addressCountry: "IN"
      }
    };
    if(p.images.length) place.image = p.images.slice(0, 6).map(i => i.url);
    if(p.amenities.length) place.amenityFeature = p.amenities.map(a => ({ "@type":"LocationFeatureSpecification", name:a.name, value:true }));
    if(Number(p.latitude) && Number(p.longitude)){
      place.geo = { "@type":"GeoCoordinates", latitude:Number(p.latitude), longitude:Number(p.longitude) };
      place.hasMap = `https://www.google.com/maps?q=${Number(p.latitude)},${Number(p.longitude)}`;
    }
    if(p.reraNumbers.length){
      const ids = p.reraNumbers.map(value => ({ "@type":"PropertyValue", name:"RERA registration number", value }));
      place.identifier = ids.length === 1 ? ids[0] : ids;
    }
    /* Articles about the project (each has its own page). */
    const posts = (p.blogs || []).filter(b => b.indexable);
    if(posts.length) place.subjectOf = posts.map(b => ({ "@type":"BlogPosting", headline:b.title, url: siteUrl + "/" + b.path }));
    graph.push(place);

    /* The page itself is a listing of that project. Its offers give
       the price range (lowest starting price to highest maximum) and
       one Offer per priced configuration. Price-on-request and
       per-sq-ft rates are not prices, so they are left out. */
    const listing = {
      "@type": "RealEstateListing",
      "@id": pageUrl + "#listing",
      name: p.name,
      url: pageUrl,
      mainEntity: { "@id": pageUrl + "#project" },
      provider: { "@type":"RealEstateAgent", "@id": siteUrl + "/#organisation", name:"Keys99", url: siteUrl }
    };
    const day = v => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined; };
    listing.datePosted = day(p.publishedAt);
    listing.dateModified = day(p.updatedAt);

    const priced = p.configurations.filter(c => c.priceValue);
    if(priced.length){
      const ready = ["ready_to_move", "completed", "possession_started", "resale"].includes(p.statusKey);
      const schemaAvailability = soldOut => "https://schema.org/" + (soldOut ? "SoldOut" : ready ? "InStock" : "PreSale");
      listing.offers = {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: Math.min(...priced.map(c => c.priceValue)),
        highPrice: Math.max(...priced.map(c => c.priceMaxValue)),
        offerCount: priced.length,
        availability: schemaAvailability(priced.every(c => c.soldOut)),
        offers: priced.map(c => {
          const commercialUnit = p.kind === "commercial";
          const label = [c.bhk, c.variant].filter(Boolean).join(" ") || (commercialUnit ? "Commercial Unit" : "Apartment");
          const flat = { "@type": commercialUnit ? "Place" : "Apartment", name: `${label} in ${p.name}` };
          const rooms = commercialUnit ? 0 : parseFloat(c.bhk);
          if(rooms > 0) flat.numberOfBedrooms = Math.floor(rooms);
          if(c.areaValue) flat.floorSize = { "@type":"QuantitativeValue", value:c.areaValue, unitCode:c.areaUnitCode };
          const offer = {
            "@type": "Offer",
            name: label,
            priceCurrency: "INR",
            availability: schemaAvailability(c.soldOut),
            itemOffered: flat
          };
          if(c.priceMaxValue > c.priceValue){
            offer.priceSpecification = { "@type":"PriceSpecification", priceCurrency:"INR", minPrice:c.priceValue, maxPrice:c.priceMaxValue };
          }else{
            offer.price = c.priceValue;
          }
          return offer;
        })
      };
    }
    graph.push(listing);

    /* Project videos, for video results. Google needs a name, a
       thumbnail and an upload date; a video missing one is left out.
       Uploaded files have no thumbnail of their own, so they use the
       project's main photo. */
    p.videos.forEach(v => {
      const info = videoInfo(v.url);
      const thumb = info.thumb || (info.platform === "file" && p.images.length ? p.images[0].url : "");
      const uploadDate = day(v.date);
      if(!thumb || !uploadDate) return;
      const name = v.title ? `${p.name} - ${v.title}` : `${p.name} ${v.type === "virtual_tour" ? "virtual tour" : "video"}`;
      const video = {
        "@type": "VideoObject",
        name,
        description: v.description || `${name}, ${[p.locality, p.city].filter(Boolean).join(", ")}.`,
        thumbnailUrl: thumb,
        uploadDate,
        about: { "@id": pageUrl + "#project" }
      };
      if(info.platform === "file") video.contentUrl = v.url;
      else if(info.platform === "youtube") video.embedUrl = info.embed.replace(/\?.*$/, "");
      else video.url = v.url;
      graph.push(video);
    });

    /* Home > City > Locality > Project; build/hubs.js writes the
       city and locality pages these point to. */
    const citySlug = slugify(p.city), localitySlug = slugify(p.locality);
    const crumbs = [
      { name:"Home", item: siteUrl + "/" },
      citySlug ? { name:p.city, item: `${siteUrl}/${p.basePath || "projects"}/${citySlug}/` } : null,
      citySlug && localitySlug ? { name:p.locality, item: `${siteUrl}/${p.basePath || "projects"}/${citySlug}/${localitySlug}/` } : null,
      { name:p.name, item: pageUrl }
    ].filter(Boolean);
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type":"ListItem", position:i + 1, name:c.name, item:c.item }))
    });

    if(p.faqs.length){
      graph.push({
        "@type": "FAQPage",
        mainEntity: p.faqs.map(f => ({ "@type":"Question", name:f.question, acceptedAnswer:{ "@type":"Answer", text:f.answer } }))
      });
    }

    return JSON.stringify({ "@context":"https://schema.org", "@graph": graph }).replace(/</g,"\\u003c");
  }

  return {
    PROJECT_DETAIL_SELECT,
    COMMERCIAL_DETAIL_SELECT,
    KINDS,
    kindOf,
    normalizeProject,
    THUMB_DIR,
    IMAGE_WIDTHS,
    IMG_FALLBACK,
    COVER_FALLBACK,
    MIN_INDEXED_WORDS,
    thumbName,
    ogName,
    OG_SIZE,
    pageTitle,
    fitTitle,
    fitText,
    pageDescription,
    structuredData,
    renderConfigurationRows,
    renderHighlights,
    renderFacts,
    renderAmenities,
    renderNearbyRows,
    renderSpecificationRows,
    renderTowerRows,
    renderPhaseRows,
    renderUpdates,
    renderLegal,
    renderProsCons,
    renderFaqs,
    renderBlogs,
    articleText,
    shorten,
    formatDay,
    renderFloorPlans,
    renderThumbs,
    pickSimilar,
    videoInfo,
    renderVideos,
    escapeHtml,
    formatPrice,
    slugify
  };
});

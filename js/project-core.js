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
    launch_date, rera_number, rera_possession_date, target_possession_date,
    address, pincode, latitude, longitude,
    total_land_area, land_area_unit, total_towers_buildings, total_floors,
    total_residential_units, open_green_area_value, open_green_area_unit,
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
      bhk_type, variant_name, carpet_area, area_unit, starting_price, maximum_price,
      price_type, price_on_request, availability, display_order
    ),
    media:residential_media!residential_media_project_id_fkey (
      media_type, category, title, media_url, media_path, storage_bucket,
      alt_text, platform, is_primary, is_active, display_order
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
    floor_plans:residential_floor_plans!residential_floor_plans_project_id_fkey (
      bhk_type, plan_type, title, image_url, image_path, storage_bucket,
      alt_text, is_active, display_order
    ),
    towers:residential_towers!residential_towers_project_id_fkey (
      tower_name, number_of_floors, number_of_units, configurations,
      tower_status, display_order
    )
  `;

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

  const AVAILABILITY_LABELS = {
    available:"Available",
    sold_out:"Sold Out",
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
    eco_friendly:"Eco Friendly"
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

  /* ---------------- SMALL HELPERS ---------------- */

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

  /* ---------------- NORMALISE ---------------- */

  function normalizeProject(row, opts){
    const supabaseUrl = (opts && opts.supabaseUrl) || "";
    const root = (opts && opts.root) || "";
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
      .map(m => ({ url: mediaUrl(m), type: m.media_type, title: clean(m.title), platform: clean(m.platform) }))
      .filter(v => v.url);

    const priceOnRequest = row.price_on_request === true;

    const configurations = list(row.configurations).map(c => {
      const from = Number(c.starting_price), to = Number(c.maximum_price);
      const onRequest = priceOnRequest || c.price_on_request === true;
      const perUnit = c.price_type === "price_per_sq_ft" ? " / Sq.Ft" : c.price_type === "price_per_sq_m" ? " / Sq.M" : "";
      let price = "On Request";
      if(!onRequest && from > 0){
        price = formatPrice(from) + (to > from ? " – " + formatPrice(to) : "") + perUnit;
      }
      const area = Number(c.carpet_area);
      /* Price per sq ft: quoted directly for per-sq-ft pricing, otherwise
         the starting price over the carpet area (sq m converted). */
      const sqft = area > 0 ? (c.area_unit === "sq_m" ? area * SQFT_PER_SQM : area) : 0;
      let rate = null;
      if(!onRequest && from > 0){
        if(c.price_type === "price_per_sq_ft") rate = from;
        else if(c.price_type === "price_per_sq_m") rate = from / SQFT_PER_SQM;
        else if(sqft > 0) rate = from / sqft;
      }
      return {
        bhk: normaliseBhk(c.bhk_type),
        variant: clean(c.variant_name),
        price,
        priceValue: !onRequest && from > 0 && !perUnit ? from : null,
        area: area > 0 ? formatNumber(area) + " " + (c.area_unit === "sq_m" ? "Sq.M" : "Sq.Ft") : "",
        availability: AVAILABILITY_LABELS[c.availability] || "Available",
        soldOut: c.availability === "sold_out",
        /* For structured data: the top of the price range, and the
           carpet area as a number with its UN/CEFACT unit code. */
        priceMaxValue: !onRequest && from > 0 && !perUnit ? (to > from ? to : from) : null,
        areaValue: area > 0 ? area : null,
        areaUnitCode: c.area_unit === "sq_m" ? "MTK" : "FTK",
        rate: rate ? Math.round(rate / 10) * 10 : null,
        rateText: rate ? formatRate(rate) : ""
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

    const statusKey = row.status;
    const city = row.city ? titleCase(row.city.name) : "";
    const locality = row.locality ? titleCase(row.locality.name) : "";
    const state = row.city ? titleCase(row.city.state) : "";
    const name = titleCase(row.project_name) || "Residential Project";
    const typeLabel = PROJECT_TYPE_LABELS[row.project_type] || "Residential Project";

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
      status: STATUS_LABELS[t.tower_status] || titleCase(String(t.tower_status || "").replace(/_/g," "))
    }));

    const specifications = SPEC_FIELDS.map(([key,label]) => ({ label, value: clean(row[key]) })).filter(s => s.value);

    const facts = [];
    const addFact = (label, value) => { if(clean(value)) facts.push({ label, value: clean(value) }); };
    addFact("Price / Sq.Ft", rateRange);
    if(Number(row.total_land_area) > 0) addFact("Land Area", formatNumber(row.total_land_area) + " " + (UNIT_LABELS[row.land_area_unit] || ""));
    addFact("Towers", row.total_towers_buildings);
    addFact("Floors", row.total_floors);
    addFact("Total Units", row.total_residential_units);
    if(Number(row.open_green_area_value) > 0) addFact("Open Green Area", formatNumber(row.open_green_area_value) + " " + (UNIT_LABELS[row.open_green_area_unit] || ""));
    addFact("Launch Date", formatMonthYear(row.launch_date));
    addFact("RERA Possession", formatMonthYear(row.rera_possession_date));

    const agent = row.agent || null;
    const developer = row.developer || null;

    return {
      id: row.id,
      slug: row.slug,
      name,
      typeLabel,
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
      rera: clean(row.rera_number),
      possession: formatMonthYear(row.target_possession_date || row.rera_possession_date),
      overview: clean(row.overview),
      highlights: (row.highlights || []).map(clean).filter(Boolean),
      startingPrice,
      startingPriceText: startingPrice ? formatPrice(startingPrice) : "Price on Request",
      priceDisclaimer: clean(row.price_disclaimer),
      bhkLabels,
      firstArea: (configurations.find(c => c.area) || {}).area || "",
      configurations,
      images,
      masterPlans,
      videos,
      amenities,
      nearby,
      faqs,
      pros, cons,
      floorPlans,
      towers,
      specifications,
      facts,
      seoTitle: clean(row.seo_title),
      seoDescription: clean(row.seo_description),
      views: Number(row.view_count) || 0,
      publishedAt: row.published_at || row.created_at,
      updatedAt: row.updated_at || row.published_at || row.created_at
    };
  }

  /* ---------------- SEO TEXT ---------------- */

  function pageTitle(p){
    if(p.seoTitle) return p.seoTitle;
    const bhk = p.bhkLabels.length ? p.bhkLabels.join(", ") + " " : "";
    const where = [p.locality, p.city].filter(Boolean).join(", ");
    return `${p.name}${where ? " " + where : ""} - ${bhk}${p.typeLabel}${p.developer ? " by " + p.developer : ""} | Keys99`;
  }

  function pageDescription(p){
    if(p.seoDescription) return p.seoDescription;
    const parts = [
      `${p.name}${p.locality ? " in " + p.locality : ""}${p.city ? ", " + p.city : ""}`,
      p.developer ? `by ${p.developer}` : "",
      p.bhkLabels.length ? `offers ${p.bhkLabels.join(", ")} ${p.typeLabel.toLowerCase()}s` : "",
      p.startingPrice ? `from ${p.startingPriceText}` : "",
    ].filter(Boolean).join(" ");
    const tail = [p.status, p.possession ? "possession " + p.possession : "", p.rera ? "RERA " + p.rera : ""].filter(Boolean).join(", ");
    return (parts + "." + (tail ? " " + tail + "." : "") + " Photos, floor plans, amenities and price on Keys99.").slice(0, 300);
  }

  /* ---------------- SECTION RENDERERS (HTML strings) ---------------- */

  function renderConfigurationRows(p){
    return p.configurations.map(c => `
      <tr>
        <td>${escapeHtml(c.bhk)}${c.variant ? ` <small>${escapeHtml(c.variant)}</small>` : ""}</td>
        <td>${escapeHtml(c.price)}${c.rateText && !/\/ Sq/.test(c.price) ? `<small class="config-rate">${escapeHtml(c.rateText)}</small>` : ""}</td>
        <td>${escapeHtml(c.area || "—")}</td>
        <td><span class="status-pill status-${c.availability === "Sold Out" ? "sold" : "available"}">${escapeHtml(c.availability)}</span></td>
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

  /* ---------------- STRUCTURED DATA ---------------- */

  function structuredData(p, pageUrl, siteUrl){
    const graph = [];

    const place = {
      "@type": "ApartmentComplex",
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
    if(p.rera) place.identifier = { "@type":"PropertyValue", name:"RERA registration number", value:p.rera };
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
          const label = [c.bhk, c.variant].filter(Boolean).join(" ") || "Apartment";
          const flat = { "@type":"Apartment", name: `${label} in ${p.name}` };
          const rooms = parseFloat(c.bhk);
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

    /* Home > City > Locality > Project; build/hubs.js writes the
       city and locality pages these point to. */
    const citySlug = slugify(p.city), localitySlug = slugify(p.locality);
    const crumbs = [
      { name:"Home", item: siteUrl + "/" },
      citySlug ? { name:p.city, item: `${siteUrl}/projects/${citySlug}/` } : null,
      citySlug && localitySlug ? { name:p.locality, item: `${siteUrl}/projects/${citySlug}/${localitySlug}/` } : null,
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
    normalizeProject,
    THUMB_DIR,
    IMAGE_WIDTHS,
    IMG_FALLBACK,
    thumbName,
    ogName,
    OG_SIZE,
    pageTitle,
    pageDescription,
    structuredData,
    renderConfigurationRows,
    renderHighlights,
    renderFacts,
    renderAmenities,
    renderNearbyRows,
    renderSpecificationRows,
    renderTowerRows,
    renderProsCons,
    renderFaqs,
    renderFloorPlans,
    renderThumbs,
    pickSimilar,
    videoInfo,
    escapeHtml,
    formatPrice,
    slugify
  };
});

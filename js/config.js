/* =========================================================
   KEYS99 - SUPABASE CONFIG
   Supabase credentials + the project query
   for the public site. Every public page loads this file
   before its own script. Fill in the two values below from
   the new Supabase project.
========================================================= */

const SUPABASE_URL =
  "https://ljyywdgwjiedeiuqchdt.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXl3ZGd3amllZGVpdXFjaGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODU5MTksImV4cCI6MjEwNTY2MTkxOX0.d6YMR0MO_MgOaD4DzknBYT4Udmy5xS_B6TntcQ7IYA8";

/* Site-wide contact for the Call / WhatsApp buttons on a project
   page whose agent is missing or not verified. Digits with country
   code, e.g. "919876543210". Leave empty to hide those buttons. */
const SITE_CONTACT = {
  phone: "",
  whatsapp: ""
};

/* supabaseClient carries the visitor's login (js/account.js) and is
   used for signing in and saved projects, and by the admin pages.
   supabasePublic never signs in, so the site's project reads and
   enquiries always run as the public (anon) role - a signed-in
   visitor sees exactly what everyone else sees. */
const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

const supabasePublic =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "k99-public" } }
  );

/* Projects live in residential_projects, with their developer,
   city, locality, configurations and media in related tables.
   One request embeds them all. residential_projects has two
   foreign keys to localities (locality_id, and city_id+locality_id),
   so the embed names the one to follow. */
const PROJECTS_TABLE = "residential_projects";

const PROJECT_SELECT = `
  id,
  slug,
  project_name,
  project_type,
  status,
  construction_stage,
  possession_status,
  rera_number,
  rera_possession_date,
  target_possession_date,
  address,
  pincode,
  overview,
  starting_price,
  maximum_price,
  price_on_request,
  main_image_path,
  main_image_bucket,
  view_count,
  published_at,
  created_at,
  developer:developers ( name ),
  city:cities ( name, state, city_image ),
  locality:localities!residential_projects_locality_id_fkey ( name ),
  configurations:residential_configurations (
    bhk_type, carpet_area, area_unit, starting_price, maximum_price,
    price_on_request, availability, display_order
  ),
  media:residential_media (
    media_type, media_url, media_path, storage_bucket,
    is_primary, is_active, display_order
  )
`;

/* Commercial projects (offices, shops, showrooms...) live in
   commercial_projects, with commercial_units in place of
   configurations. Same idea: one request for the homepage cards. */
const COMMERCIAL_TABLE = "commercial_projects";

const COMMERCIAL_SELECT = `
  id,
  slug,
  project_name,
  project_type,
  transaction_type,
  status,
  rera_number,
  address,
  pincode,
  overview,
  starting_price,
  maximum_price,
  price_on_request,
  main_image_path,
  main_image_bucket,
  view_count,
  published_at,
  created_at,
  developer:developers!commercial_projects_developer_id_fkey ( name ),
  city:cities!commercial_projects_city_id_fkey ( name, state, city_image ),
  locality:localities!commercial_projects_locality_id_fkey ( name ),
  units:commercial_units!commercial_units_project_id_fkey (
    unit_type, carpet_area, area_unit, starting_price, maximum_price, price_type,
    expected_rent, price_on_request, availability, display_order
  ),
  media:commercial_media!commercial_media_project_id_fkey (
    media_type, media_url, media_path, storage_bucket,
    is_primary, is_active, display_order
  )
`;

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

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
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
  city:cities ( name, state ),
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

-- =========================================================
-- KEYS99 - KEEP CONTACT DETAILS AND LITIGATION NOTES PRIVATE
--
-- The site reads with the public anon key, which ships in
-- js/config.js, so anything anon may select is public. Three
-- tables let anon read more than the site shows:
--
-- - agents: email (and the auth user_id) of every active,
--   verified agent. Project pages need only name, phone and
--   WhatsApp (PROJECT_DETAIL_SELECT in js/project-core.js).
-- - relationship_managers: every active manager's email and
--   phone. The site never reads this table.
-- - residential_litigation: internal_notes, parties and the
--   private supporting-document paths. Project pages show only
--   the case facts (renderLegal in js/project-core.js).
--
-- Same approach as 03-public-developer-names.sql: anon keeps the
-- table's row policies but gets only the listed columns. Signed-in
-- users (authenticated - the admin panel) are not affected.
--
-- Applied to project ljyywdgwjiedeiuqchdt.
-- =========================================================

revoke select on public.agents from anon;
grant select (id, full_name, company_name, phone, whatsapp, rera_id, photo_url, bio,
              verified, status, created_at, updated_at)
  on public.agents to anon;

revoke select on public.relationship_managers from anon;

revoke select on public.residential_litigation from anon;
grant select (id, project_id, status, case_reference_number, case_title, court_tribunal,
              case_type, filing_date, current_status, subject_issue, affected_area_tower_phase,
              case_description, latest_hearing_date, next_hearing_date, resolution_order_details,
              source_reference_url, created_at, updated_at)
  on public.residential_litigation to anon;

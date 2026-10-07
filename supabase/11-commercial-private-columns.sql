-- =========================================================
-- KEYS99 - KEEP COMMERCIAL LITIGATION NOTES PRIVATE
--
-- Same fix as 10-private-contact-and-litigation.sql, for the
-- commercial tables the site now reads. The public anon key could
-- read every column of commercial_litigation, including
-- internal_notes, parties and the private supporting-document paths.
-- Commercial project pages show only the case facts (renderLegal in
-- js/project-core.js), so anon gets just those columns. Signed-in
-- users (authenticated - the admin panel) are not affected.
--
-- Applied to project ljyywdgwjiedeiuqchdt.
-- =========================================================

revoke select on public.commercial_litigation from anon;
grant select (id, project_id, status, case_reference_number, case_title, court_tribunal,
              case_type, filing_date, current_status, subject_issue, affected_area_tower_phase,
              case_description, latest_hearing_date, next_hearing_date, resolution_order_details,
              source_reference_url, created_at, updated_at)
  on public.commercial_litigation to anon;

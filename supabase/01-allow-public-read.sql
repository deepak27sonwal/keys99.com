-- =========================================================
-- KEYS99 (NEW PROJECT) - STEP 1: LET VISITORS READ PUBLISHED PROJECTS
--
-- The public SELECT policies on residential_projects, developers,
-- cities and localities all call private.is_admin(). The anon role
-- (every visitor who is not signed in) has no EXECUTE permission on
-- that function, so Postgres rejects the whole query with
--   "permission denied for function is_admin"
-- and the homepage cannot load a single project.
--
-- is_admin() is SECURITY DEFINER and only checks auth.uid() against
-- user_roles. For anon, auth.uid() is null, so it simply returns
-- false - granting EXECUTE exposes no data and changes no policy.
-- private.is_super_admin() is already executable by anon.
--
-- Run once: Dashboard -> SQL Editor -> New query -> paste -> Run
-- =========================================================

grant execute on function private.is_admin() to anon;

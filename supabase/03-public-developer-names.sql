-- =========================================================
-- KEYS99 - SHOW THE DEVELOPER OF EVERY PUBLISHED PROJECT
--
-- The original developers policy only lets visitors read
-- developers that are active AND verified, so cards and project
-- pages showed no developer for unverified ones. This adds a
-- policy for the developer of any published project, and limits
-- what visitors (anon) can read to public columns, so contact
-- email / phone stay private.
--
-- Applied to project ljyywdgwjiedeiuqchdt.
-- =========================================================

create policy "Developers of published projects are publicly viewable"
  on public.developers for select
  to anon, authenticated
  using (exists (
    select 1 from public.residential_projects p
    where p.developer_id = developers.id
      and p.moderation_status = 'published'
      and p.deleted_at is null
  ));

revoke select on public.developers from anon;
grant select (id, name, logo_url, description, website, verified, status, created_at, updated_at)
  on public.developers to anon;

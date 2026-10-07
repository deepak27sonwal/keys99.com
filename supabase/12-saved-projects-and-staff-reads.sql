-- =========================================================
-- KEYS99 - SAVED PROJECTS IN THE DATABASE, AND STAFF-ONLY READS
--
-- 1. Visitors can now sign in (Google or an email code) to save
--    projects. Every signed-in account uses the "authenticated"
--    role, which until now could read private columns the public
--    cannot: agent emails, relationship managers' and developers'
--    contact details, litigation internal notes and parties. Those
--    reads are limited to staff: an account with any role in
--    user_roles (super_admin, admin, editor, agent, moderator), or
--    an agent's own record. The public site reads with the anon
--    key even when a visitor is signed in (supabasePublic in
--    js/config.js), so visitors see exactly what the public sees.
--    The anon (public) rules are unchanged.
--
-- 2. saved_projects: one row per saved project per account. Each
--    account can read, add and remove only its own rows.
--
-- Applied to project ljyywdgwjiedeiuqchdt.
-- =========================================================

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()));
$$;

-- ---------- agents ----------
drop policy if exists "Agents can be viewed publicly when active and verified or by ad" on public.agents;
create policy "Agents are public when active and verified"
  on public.agents for select to anon
  using (status = 'active' and verified = true);
create policy "Staff can view agents; agents their own record"
  on public.agents for select to authenticated
  using (((status = 'active' and verified = true) and (select private.is_staff()))
    or (select private.is_admin()) or user_id = (select auth.uid()));

-- ---------- relationship managers ----------
drop policy if exists "Relationship managers can be viewed publicly when active or by " on public.relationship_managers;
create policy "Relationship managers are public when active"
  on public.relationship_managers for select to anon
  using (status = 'active');
create policy "Staff can view relationship managers"
  on public.relationship_managers for select to authenticated
  using ((status = 'active' and (select private.is_staff())) or (select private.is_admin()));

-- ---------- developers ----------
drop policy if exists "Developers can be viewed publicly when active or by admin" on public.developers;
drop policy if exists "Developers of published projects are publicly viewable" on public.developers;
create policy "Developers are public when active and verified"
  on public.developers for select to anon
  using (status = 'active' and verified = true);
create policy "Developers of published projects are public"
  on public.developers for select to anon
  using (exists (select 1 from public.residential_projects p
                  where p.developer_id = developers.id and p.moderation_status = 'published' and p.deleted_at is null)
      or exists (select 1 from public.commercial_projects p
                  where p.developer_id = developers.id and p.moderation_status = 'published' and p.deleted_at is null));
create policy "Staff can view developers"
  on public.developers for select to authenticated
  using ((select private.is_admin())
    or ((select private.is_staff()) and (
         (status = 'active' and verified = true)
      or exists (select 1 from public.residential_projects p
                  where p.developer_id = developers.id and p.moderation_status = 'published' and p.deleted_at is null)
      or exists (select 1 from public.commercial_projects p
                  where p.developer_id = developers.id and p.moderation_status = 'published' and p.deleted_at is null))));

-- ---------- litigation ----------
drop policy if exists "Authenticated users can view litigation" on public.residential_litigation;
create policy "Staff and project owners can view litigation"
  on public.residential_litigation for select to authenticated
  using (((select private.is_staff()) and status <> 'information_not_available'
          and exists (select 1 from public.residential_projects p
                       where p.id = residential_litigation.project_id and p.moderation_status = 'published'))
      or exists (select 1 from public.residential_projects p
                  where p.id = residential_litigation.project_id
                    and (p.created_by = (select auth.uid()) or (select private.is_admin()))));

drop policy if exists "Public can view published commercial_litigation" on public.commercial_litigation;
create policy "Public can view published commercial litigation"
  on public.commercial_litigation for select to anon
  using (status <> 'information_not_available'
     and exists (select 1 from public.commercial_projects p
                  where p.id = commercial_litigation.project_id and p.moderation_status = 'published'));
create policy "Staff and project owners can view commercial litigation"
  on public.commercial_litigation for select to authenticated
  using (((select private.is_staff()) and status <> 'information_not_available'
          and exists (select 1 from public.commercial_projects p
                       where p.id = commercial_litigation.project_id and p.moderation_status = 'published'))
      or exists (select 1 from public.commercial_projects p
                  where p.id = commercial_litigation.project_id
                    and (p.created_by = (select auth.uid()) or (select private.is_admin()))));

-- ---------- saved projects ----------
create table if not exists public.saved_projects (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_kind text not null check (project_kind in ('residential', 'commercial')),
  project_id   uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, project_kind, project_id)
);

alter table public.saved_projects enable row level security;

revoke all on public.saved_projects from anon;
grant select, insert, delete on public.saved_projects to authenticated;

drop policy if exists "Users read their saved projects" on public.saved_projects;
drop policy if exists "Users save projects for themselves" on public.saved_projects;
drop policy if exists "Users remove their saved projects" on public.saved_projects;
create policy "Users read their saved projects"
  on public.saved_projects for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users save projects for themselves"
  on public.saved_projects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users remove their saved projects"
  on public.saved_projects for delete to authenticated
  using (user_id = (select auth.uid()));

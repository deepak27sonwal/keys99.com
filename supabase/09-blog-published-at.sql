-- =========================================================
-- KEYS99 - PROJECT BLOG: SET THE PUBLISH DATE AUTOMATICALLY
--
-- Each published post in residential_project_blogs gets its own
-- page (/projects/<project>/blog/<post>/) with its date in the
-- page and in the structured data Google reads. The admin does not
-- always fill published_at, so this sets it the first time a post
-- is published and never changes it after that. Edits still update
-- updated_at, which the page shows as "Updated".
--
-- Safe to run more than once.
-- =========================================================

create or replace function private.set_blog_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_blog_published_at on public.residential_project_blogs;
create trigger set_blog_published_at
  before insert or update on public.residential_project_blogs
  for each row execute function private.set_blog_published_at();

-- Posts already published without a date keep the day they were written.
update public.residential_project_blogs
   set published_at = created_at
 where is_published and published_at is null;

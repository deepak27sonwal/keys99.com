# Keys99 – new project

Same UI as the Keys99 site in the repo root, running on a **separate Supabase
database** (`ljyywdgwjiedeiuqchdt`). Built step by step; this folder currently
holds **step 1: the homepage**.

## Database

The homepage reads the existing schema; it does not create tables.

| Homepage data | Source |
|---|---|
| Project cards | `residential_projects` where `moderation_status = 'published'` and `deleted_at is null` |
| Project name, type, status, RERA, address | `residential_projects` |
| Developer | `developers` (only shown when the developer is active **and verified**) |
| City / state, locality | `cities`, `localities` |
| BHK, carpet area, price, availability | `residential_configurations` |
| Card image | `residential_media` (`main_image`, else first `gallery`) |
| New Launch section | status or construction stage `new_launch`, or published in the last 30 days |

`js/config.js` holds the URL, anon key and the query (`PROJECT_SELECT`).
`index.html` flattens each project into the card shape in
`mapResidentialProject()`.

## Setup

1. Run `supabase/01-allow-public-read.sql` once in the Supabase SQL Editor.
   Without it, visitors who are not signed in get
   `permission denied for function is_admin` and the homepage shows no
   projects.
2. Upload the folder's contents to Hostinger (`public_html`), including
   `.htaccess`.

## Not built yet

Links to search, project, city/locality, login, profile, post-property, reels,
terms and privacy pages will 404 until those steps are added. The chat widget
needs the `chat-agent` Edge Function, which is also a later step.

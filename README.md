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

## Search engines (pre-launch)

The site is deliberately kept out of Google until the final version:

- `index.html` has `<meta name="robots" content="noindex,nofollow">`
- `.htaccess` sends `X-Robots-Tag: noindex, nofollow` on every response

At launch, set the meta tag back to `index,follow,max-image-preview:large`,
delete the `X-Robots-Tag` line, then add the site in Google Search Console and
submit the sitemap. Do **not** block the site with a `robots.txt`
`Disallow: /` instead — Google then can't read the noindex and may still list
the URLs.

## Project pages

Each published project gets its own page at `/projects/<slug>/`, generated
with its content, title, meta description, canonical URL, Open Graph tags and
JSON-LD already in the HTML.

| File | Role |
|---|---|
| `projects/property-details.html` | Page template; also the fallback page (`?slug=`), never indexed |
| `js/project-core.js` | Query + data mapping + section HTML, shared by browser and build |
| `js/property-details.js` | Page behaviour: gallery, EMI, enquiry form, live refresh |
| `build/generate.js` | Writes `projects/<slug>/index.html` and `sitemap.xml` |
| `.github/workflows/build-pages.yml` | Runs the build daily, on demand, and when the template changes |

Run locally: `npm install` then `npm run build`.

- Pages are `noindex` until launch. At launch set `SITE_INDEXABLE=true` in the
  workflow's build step.
- A generated page renders from the data built into it and only refreshes from
  Supabase, so a failed request never shows "not found" over real content.
- Enquiries go to `residential_enquiries`. Call / WhatsApp use the project's
  agent (when active and verified), else `SITE_CONTACT` in `js/config.js`.
- Projects removed or unpublished disappear on the next build.

### Instant rebuilds

The site is built by Cloudflare Pages (see `CLOUDFLARE.md`).
`supabase/08-cloudflare-build-hook.sql` adds database triggers that mark the
site as needing a build whenever a published project or anything on its page
changes, and a `pg_cron` job that calls the Cloudflare deploy hook once edits
have settled for 2 minutes, plus a daily rebuild. The hook URL is stored in
Supabase Vault as `cloudflare_deploy_hook`; until it is added, nothing is sent.

## Locality guides

`content/localities/<city>/<locality>.html` holds hand-written text about a
locality (connectivity, living there, who it suits). The build shows it on
`/projects/<city>/<locality>/` under the projects, and turns each
`<details><summary>Question</summary><p>Answer</p></details>` into an FAQ
(with FAQPage JSON-LD). Links are written from the site root, e.g.
`projects/pune/moshi/`. The file name must match the locality's URL slug.

A guide whose top comment contains `status: draft` is shown but does not make
the page indexable. Check the facts, then delete that line: a locality with a
checked guide is indexed and listed in the sitemap even with a single project.

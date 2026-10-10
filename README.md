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

## Search engines

The site is live for search engines: every page carries
`index,follow,max-image-preview:large` and no `X-Robots-Tag` header is sent.
Kept out on purpose: `admin/leads.html` (private), pages with too little
content (hubs under `HUB_MIN_INDEXED` projects, thin posts and comparisons)
and the `<project>.pages.dev` copy (`cloudflare/_headers`).

`SITE_INDEXABLE=false` in the build environment holds a build back (every page
`noindex,nofollow`), e.g. for a staging copy. Add the site in Google Search
Console and submit `https://keys99.com/sitemap.xml`. Do **not** block the site
with a `robots.txt` `Disallow: /`.

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

Run locally: `npm install` then `npm run build`.

- Pages are indexable by default; `SITE_INDEXABLE=false` holds a build back.
- A generated page renders from the data built into it and only refreshes from
  Supabase, so a failed request never shows "not found" over real content.
- Enquiries go to `residential_enquiries`. Call / WhatsApp use the project's
  agent (when active and verified), else `SITE_CONTACT` in `js/config.js`.
- Projects removed or unpublished disappear on the next build.

### Project blog posts

Published posts in `residential_project_blogs` get their own page at
`/projects/<project>/blog/<post-slug>/` (`build/blog.js`). The project page
lists them as cards that link there, each post links back to its project, and
`/blog/` lists them under "Project Insights" next to the guides in
`content/blog/`. Every post page has its own title, meta description,
canonical URL, a 1200x630 link-preview image made from the cover, and
`BlogPosting` + `BreadcrumbList` structured data, and is added to
`sitemap.xml` (with its cover as an image entry) and to the feed at
`/blog/feed.xml`. City, locality and developer pages link the newest posts
about their projects ("From the Keys99 Blog"), and the project's structured
data lists its posts (`subjectOf`).

- Covers are resized at build time (`build/thumbs.js`): WebP copies for the
  page and cards, so a 2 MB phone photo never loads on the page.
- Each `## ` heading gets a link anchor, and a post with 3 or more of them
  shows an "On this page" list at the top.

- Write the body as plain text: a blank line starts a paragraph, `## ` a
  heading (`### ` a smaller one), `- ` a bullet, `1. ` a numbered item,
  `**bold**`, and `[text](link)` a link (`https://...` or a site path such as
  `/projects/pune/`). Links to other Keys99 pages help Google crawl the site.
- `meta_description` is the text Google shows; without it the excerpt or the
  first lines of the post are used.
- Posts under 250 words are built and linked but kept out of Google's index
  and the sitemap (thin pages count against the whole site).
- Run `supabase/09-blog-published-at.sql` once so `published_at` is set when
  a post is first published.

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

## Blog

Articles live in `content/blog/<slug>.html` and are built to `/blog/<slug>/`,
with a list at `/blog/` (`build/blog.js`). Each file starts with a comment
giving its `title`, `description` and `date` (plus optional `updated`,
`author` and `category`); see the top of `build/blog.js` for the format. As in
the locality guides, links are written from the site root and `<details>`
blocks become FAQs.

An article with `status: draft` in that comment is published but kept out of
the index and the sitemap. Check it, then delete the line.

# Hosting keys99.com on Cloudflare Pages

Cloudflare Pages builds and hosts the site. On every build it pulls the code
from GitHub, reads the projects from Supabase (`build/generate.js`), writes
every page, and publishes only the public files (`build/cloudflare-dist.js`).

A build starts:
- **on every push to `main`**;
- **a couple of minutes after a project is published, edited or removed**:
  Supabase calls Cloudflare's deploy hook (`supabase/08-cloudflare-build-hook.sql`);
- **once a day** as a safety net (03:17 IST).

## 1. Create the Pages project

In the Cloudflare dashboard, go to **Workers & Pages → Create** and choose
**Pages**, not Workers (on the Workers screen, look for "Looking to deploy
Pages? Get started"). Then **Import an existing Git repository**, pick
`deepak27sonwal/keys99.com`, and enter:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build:cloudflare` |
| Build output directory | `dist` |

Environment variables (Production):

| Variable | Value | Why |
|---|---|---|
| `NODE_VERSION` | `22` | The build needs Node 20 or newer |
| `ASSET_ORIGIN` | `https://<project>.pages.dev` | While testing: link-preview images load from the address that serves the site. **Delete at launch** |

No Supabase key needs adding: the build reads the public URL and anon key from
`js/config.js`.

The site appears at `https://<project>.pages.dev`. That address sends
`X-Robots-Tag: noindex` permanently (see `cloudflare/_headers`), so it never
competes with keys99.com in Google.

## 2. Rebuild automatically when data changes

1. In the Pages project, go to **Settings → Builds** (or **Builds &
   deployments**) **→ Deploy hooks → Add deploy hook**. Name it `supabase`,
   branch `main`, then copy the URL it shows.
   **Treat this URL like a password**: anyone with it can start builds.
2. In Supabase, open the **SQL Editor** and run
   `supabase/08-cloudflare-build-hook.sql` (once; running it again is safe).
3. In the SQL Editor, save the hook URL (paste it between the quotes):

   ```sql
   select vault.create_secret(
     'PASTE-THE-DEPLOY-HOOK-URL-HERE',
     'cloudflare_deploy_hook',
     'Cloudflare Pages deploy hook: rebuild keys99.com');
   ```

4. Test it: edit a published project in the admin. Within about 3 minutes, a
   new build appears under **Deployments** in Cloudflare.

Check what the trigger is doing:

```sql
select * from private.site_build_queue;   -- waiting build, last one sent
select private.send_site_build(true);     -- start a build now
```

If you ever replace the hook, update the saved URL:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cloudflare_deploy_hook'),
  'NEW-DEPLOY-HOOK-URL');
```

## 3. Retire the GitHub build (after Cloudflare is confirmed)

Until step 2's test works, leave the GitHub Action running. It keeps the old
GitHub Pages test site updating. Then:

1. Delete `.github/workflows/build-pages.yml`.
2. In GitHub, go to **Settings → Pages** and unpublish the site.
3. Optionally, stop tracking the generated pages in git (`projects/*/`,
   `developers/`, `sitemap.xml` and so on). Cloudflare writes them on every
   build, so the repository only needs the sources.

## 4. What publishes and what doesn't

`build/cloudflare-dist.js` copies only the pages, `assets/`, `css/`, `js/`,
`projects/`, `developers/`, `admin/`, `robots.txt`, `sitemap.xml` and
`favicon.ico`, plus `cloudflare/_headers` and `cloudflare/_redirects`.
`build/`, `content/`, `supabase/`, `.github/`, `node_modules/` and the SQL
files are never published. A new top-level page must be added to the `PUBLIC`
list in that script.

## 5. Clean URLs

Pages are addressed without `.html`: `/about`, `/contact`, `/terms`,
`/privacy-policy`, `/projects/search`. Cloudflare serves `about.html` for
`/about` and permanently redirects `/about.html` to `/about`, so canonical
tags, the sitemap and every link use the short form. `.htaccess` does the same
on Apache.

## 6. Point keys99.com at it (at launch)

1. **Add the domain:** in the Pages project, open **Custom domains** and add
   `keys99.com` and `www.keys99.com`. Cloudflare walks you through the DNS
   change. Email records (MX) for `support@keys99.com` are not touched.
2. **www to keys99.com:** create a redirect rule (**Rules → Redirect Rules**)
   that sends `www.keys99.com/*` to `https://keys99.com/${1}` with a 301,
   keeping the query string.
3. **HTTPS:** turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.

## 7. Launch checklist (search engines)

1. Cloudflare environment variables: delete `ASSET_ORIGIN`, and add
   `SITE_INDEXABLE` = `true`.
2. `cloudflare/_headers`: delete the `X-Robots-Tag: noindex, nofollow` line
   under `/*`. Keep the `pages.dev` rule.
3. `index.html`: set the robots meta tag to `index,follow,max-image-preview:large`.
4. Push to `main`. Cloudflare rebuilds with the new settings.
5. In Google Search Console, add `keys99.com` and submit
   `https://keys99.com/sitemap.xml`.

## Notes

- **Build allowance.** The free plan includes 500 builds a month. Edits are
  batched (one build after 2 quiet minutes) and the daily rebuild adds about
  30 a month, so normal use stays far below the limit.
- **Build time.** Each build re-creates any resized photos missing from
  `assets/thumbs/` (about a minute at today's size). If listings grow into the
  hundreds, store thumbnails in Supabase Storage so each is made once.
- **Before a project's page is built**, its link still works: `404.html`
  sends visitors to the project page that loads by slug. A brand-new city or
  locality shows the 404 page until the build finishes.

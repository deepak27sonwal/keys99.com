# Hosting keys99.com on Cloudflare Pages

The GitHub Action (`.github/workflows/build-pages.yml`) builds every page from
Supabase and commits them to `main`. Cloudflare Pages then publishes each new
commit on `main`. Cloudflare does not rebuild the pages itself: its build step
only copies the public files into `dist/`.

## 1. Create the Pages project

In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect
to Git**, choose `deepak27sonwal/keys99.com`, then enter:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `node build/cloudflare-dist.js` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

No Supabase keys are needed here: the pages are already built.

The site first appears at `<project>.pages.dev`. Test it there. That address
sends `X-Robots-Tag: noindex` permanently (see `cloudflare/_headers`), so it
never competes with keys99.com in Google.

## 2. What publishes and what doesn't

`build/cloudflare-dist.js` copies only the pages, `assets/`, `css/`, `js/`,
`projects/`, `developers/`, `admin/`, `robots.txt`, `sitemap.xml` and
`favicon.ico`, plus `cloudflare/_headers` and `cloudflare/_redirects`.
`build/`, `content/`, `supabase/`, `.github/`, `node_modules/` and the SQL
files are never published. A new top-level page must be added to the `PUBLIC`
list in that script.

## 3. Clean URLs

Pages are addressed without `.html`: `/about`, `/contact`, `/terms`,
`/privacy-policy`, `/projects/search`. Cloudflare serves `about.html` for
`/about` and permanently redirects `/about.html` to `/about`, so canonical
tags, the sitemap and every link use the short form. `.htaccess` does the same
on Apache, so the site also works on Hostinger.

## 4. Point keys99.com at it (at launch)

1. **Add the domain:** in the Pages project, open **Custom domains** and add
   `keys99.com` and `www.keys99.com`. Cloudflare walks you through the DNS
   change. Email records (MX) for `support@keys99.com` are not touched.
2. **www to keys99.com:** create a redirect rule (**Rules → Redirect Rules**)
   that sends `www.keys99.com/*` to `https://keys99.com/${1}` with a 301,
   keeping the query string.
3. **HTTPS:** turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.

## 5. Launch checklist (search engines)

1. `cloudflare/_headers`: delete the `X-Robots-Tag: noindex, nofollow` line
   under `/*`. Keep the `pages.dev` rule.
2. `.github/workflows/build-pages.yml`: delete the `ASSET_ORIGIN` line, and set
   `SITE_INDEXABLE: "true"` in the build step's `env`.
3. `index.html`: set the robots meta tag to `index,follow,max-image-preview:large`.
4. `.htaccess`: delete the `X-Robots-Tag` line (this matters only if Apache
   hosting is kept).
5. In Google Search Console, add `keys99.com` and submit
   `https://keys99.com/sitemap.xml`.

## Notes

- **Build limit.** The free plan allows 500 builds a month. Every commit to
  `main` triggers one, including the Action's "Rebuild project pages"
  commits, which happen only when something changed. If the limit is ever
  reached, deploy from the Action with `wrangler pages deploy dist` instead
  of the Git connection.
- **A new city or locality** that has not been built yet shows the 404 page
  until the next build. New projects don't: `404.html` sends them to the
  project page, which loads by slug. Builds are triggered by Supabase as soon
  as a project changes, so the gap is minutes.

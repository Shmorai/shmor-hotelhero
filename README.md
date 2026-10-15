# HotelHero  (hotelhero.shmor.ai)

Part of the Shmor.ai network: its own brand, design and SEO, listed on shmor.ai via `shmor-site.json`.

## Edit
| What | Where |
|---|---|
| Card on shmor.ai, search keywords, **referral links**, offers | `shmor-site.json` |
| Pages (one JSON file = one Google-indexable page) | `content/` (`home.json` is the homepage; `content/guides/x.json` → `/guides/x/`) |
| Design | `templates/layout.html`, `assets/site.css` |

## Page file fields
`slug`, `title` (30–60 chars, unique), `description` (120–158 chars, unique), `h1`, `eyebrow`, `intro`,
`nav` + `navOrder` (show in menu), `chips`, `highlights`, `partners` (link slugs), `sections` [{h2, html}],
`faqs` [{q, a}] (adds FAQ rich results), `related` [slugs], `keywords`, `updated`, `noindex`.

## Commands
```bash
node tools/build.js         # build pages, sitemap.xml, robots.txt, structured data
node tools/serve.js 4001    # preview at http://localhost:4001
```
After changing `shmor-site.json`, also run `node tools/sync-network.js` in `Shmor/shmor-ai`.

## Referral links in pages
List link slugs in a page's `"partners"`, or add `"offers"` in `shmor-site.json` (optional `"pages": ["slug"]`).
Links are written into the HTML as `https://shmor.ai/go/?to=<slug>&src=hotelhero-<page>` with `rel="sponsored nofollow"`.

## Deploy (only at launch; keep private until then)
GitHub repo `Shmorai/shmor-hotelhero` → Settings → Pages → branch `main`, root. Custom domain `hotelhero.shmor.ai`.
DNS at GoDaddy: `CNAME  hotelhero  shmorai.github.io`

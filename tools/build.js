/* =====================================================================
   Shmor site kit: static SEO build
   Turns the JSON files in content/ into real, crawlable HTML pages.

     node tools/build.js          build the site into this folder
     node tools/build.js --check  validate content only

   Inputs
     shmor-site.json        site identity, seo block, referral links, offers
     content/(folders/)name.json  one file per page (content/home.json = homepage)
     templates/layout.html  this site's own design (header, footer, wrapper)
     assets/                this site's CSS / JS / images

   Every page gets: <title>, meta description, canonical, Open Graph,
   Twitter card, JSON-LD (WebSite/Organization, BreadcrumbList, FAQPage),
   breadcrumbs, internal links, and optional photos (page "image").

   Blog: a page with "type": "blog" (e.g. content/blog.json) lists every
   "type": "post" page, newest first (posts live in content/blog/*.json and
   need a "date": "YYYY-MM-DD"). Posts get BlogPosting JSON-LD, dates,
   reading time and "sources"; any page can show "latestPosts": 3. Also
   writes an RSS feed at /<blog slug>/feed.xml. A page's "heroHtml" (raw HTML,
   e.g. a finder form) is placed in the hero under the intro. Also writes sitemap.xml, robots.txt,
   404.html, /search/ (noindex) and search-index.json.

   People and bylines (optional): shmor-site.json "people": { id: { name, role,
   credentials, bio, image, url, registry: { label, url }, sameAs: [] } } lists
   REAL, verifiable contributors only. Pages can set "writtenBy" / "reviewedBy"
   (people ids) and "reviewed" ("YYYY-MM-DD"); these show in the post byline and
   in JSON-LD (author, reviewedBy, lastReviewed). seo.bylines: true adds a byline
   bar under the hero of every guide page; seo.editorialPage: "<slug>" links it
   to an editorial standards page; seo.checkedText is shown when no reviewer is
   set. A "people" block (items: [ids], or all people) renders profile cards
   with id="person-<id>" anchors, and nothing at all while "people" is empty.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const site = JSON.parse(read('shmor-site.json'));
const seo = site.seo || {};
const NAME = seo.siteName || site.name;
const BASE = `https://${site.subdomain}.shmor.ai`;
const MASTER = 'https://shmor.ai';
const TODAY = new Date().toISOString().slice(0, 10);
const LINKS = site.links || {};
const PEOPLE = site.people || {};
const EDITORIAL = seo.editorialPage || '';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = s => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const slugify = s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const errors = [], warnings = [];

/* ---------- Load pages ---------- */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.json') ? [path.join(dir, d.name)] : []);
}
const pages = walk(path.join(ROOT, 'content')).map(f => {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  try { return { ...JSON.parse(fs.readFileSync(f, 'utf8')), _file: rel }; }
  catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); return null; }
}).filter(Boolean);
const bySlug = new Map(pages.map(p => [p.slug, p]));
const home = bySlug.get('');

/* ---------- Validate ---------- */
if (!home) errors.push('content/home.json (slug "") is missing');
const seenTitle = new Map(), seenDesc = new Map();
for (const p of pages) {
  const id = p._file;
  if (typeof p.slug !== 'string' || !/^([a-z0-9-]+(\/[a-z0-9-]+)*)?$/.test(p.slug)) errors.push(`${id}: slug must be lowercase words-with-dashes (use "" for home)`);
  if (['search', 'assets', 'templates', 'tools', 'content'].includes(p.slug.split('/')[0])) errors.push(`${id}: slug "${p.slug}" is reserved`);
  for (const k of ['title', 'description', 'h1']) if (!p[k]) errors.push(`${id}: missing "${k}"`);
  if (p.title && (p.title.length < 25 || p.title.length > 65)) warnings.push(`${id}: title is ${p.title.length} chars (aim for 30–60)`);
  if (p.description && (p.description.length < 70 || p.description.length > 160)) warnings.push(`${id}: description is ${p.description.length} chars (aim for 120–158)`);
  if (seenTitle.has(p.title)) errors.push(`${id}: same title as ${seenTitle.get(p.title)}. Every page needs a unique title`);
  if (seenDesc.has(p.description)) errors.push(`${id}: same description as ${seenDesc.get(p.description)}`);
  seenTitle.set(p.title, id); seenDesc.set(p.description, id);
  for (const r of p.related || []) if (!bySlug.has(r)) errors.push(`${id}: related page "${r}" doesn't exist`);
  for (const l of p.partners || []) if (!LINKS[l]) errors.push(`${id}: partner link "${l}" isn't in shmor-site.json "links"`);
  for (const k of ['writtenBy', 'reviewedBy']) if (p[k] && !PEOPLE[p[k]]) errors.push(`${id}: ${k} "${p[k]}" isn't in shmor-site.json "people"`);
  if (p.reviewedBy && !/^\d{4}-\d{2}-\d{2}$/.test(p.reviewed || '')) errors.push(`${id}: "reviewedBy" needs "reviewed": "YYYY-MM-DD"`);
  if (p.type === 'post' && !/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) errors.push(`${id}: posts need "date": "YYYY-MM-DD"`);
  if (p.image && typeof p.image === 'object' && !p.image.src) errors.push(`${id}: "image" needs a "src"`);
  if (p.image && typeof p.image === 'object' && !p.image.alt) warnings.push(`${id}: "image" has no "alt" text`);
}
for (const o of site.offers || []) if (!LINKS[o.link]) errors.push(`shmor-site.json: offer "${o.title}" uses unknown link "${o.link}"`);

if (warnings.length) console.log('Warnings:\n  ! ' + warnings.join('\n  ! '));
if (errors.length) { console.error('\nBuild stopped:\n  ✗ ' + errors.join('\n  ✗ ')); process.exit(1); }
if (CHECK) { console.log(`✓ ${pages.length} pages valid.`); process.exit(0); }

/* ---------- Helpers ---------- */
const posts = pages.filter(p => p.type === 'post' && !p.noindex).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
const blogIndex = pages.find(p => p.type === 'blog');
const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const readMins = p => Math.max(1, Math.round(strip([p.intro, ...(p.sections || []).map(s => s.html), ...(p.faqs || []).map(f => f.a)].join(' ')).split(' ').length / 220));
const pageUrl = p => `${BASE}/${p.slug ? p.slug + '/' : ''}`;
const pagePath = p => `/${p.slug ? p.slug + '/' : ''}`;
const label = p => p.nav || p.short || p.h1;
const goHref = (slug, src) => `${MASTER}/go/?to=${encodeURIComponent(slug)}&src=${encodeURIComponent(`${site.id}-${(src || 'home').replace(/\//g, '-')}`)}`;
const AFF = 'rel="sponsored nofollow noopener" target="_blank"';

// People: profile link (editorial page anchor, else their own url), schema.org Person, byline parts
const personHref = id => EDITORIAL ? `/${EDITORIAL}/#person-${id}` : PEOPLE[id].url || '';
const person = id => { const x = PEOPLE[id]; const url = EDITORIAL ? `${BASE}/${EDITORIAL}/#person-${id}` : x.url;
  return { '@type': 'Person', name: x.name, ...(x.role ? { jobTitle: x.role } : {}), ...(x.credentials ? { description: x.credentials } : {}),
    ...(url ? { url } : {}), ...((x.sameAs || []).length ? { sameAs: x.sameAs } : {}) }; };
const personLink = id => personHref(id) ? `<a href="${esc(personHref(id))}">${esc(PEOPLE[id].name)}</a>` : esc(PEOPLE[id].name);
const byWho = p => p.writtenBy ? personLink(p.writtenBy) : `the ${esc(NAME)} editorial team`;
const reviewedHtml = p => `Reviewed by ${personLink(p.reviewedBy)}${PEOPLE[p.reviewedBy].credentials ? `, ${esc(PEOPLE[p.reviewedBy].credentials)}` : ''}, <time datetime="${p.reviewed}">${fmtDate(p.reviewed)}</time>`;

// Photos. A page's "image" is a path ("/assets/img/x.jpg") or { "src", "alt", "credit", "creditUrl" }.
// Unsplash URLs (images.unsplash.com) are resized and cropped by their CDN; other files are used as they are.
const imgOf = i => !i ? null : typeof i === 'string' ? { src: i } : i;
const isUnsplash = i => /^https:\/\/images\.unsplash\.com\//.test(i.src);
const imgSrc = (i, w, h) => isUnsplash(i) ? `${i.src.split('?')[0]}?w=${w}${h ? `&h=${h}&fit=crop` : ''}&q=70&auto=format` : i.src;
const imgSet = (i, widths, ratio) => isUnsplash(i) ? ` srcset="${widths.map(w => `${esc(imgSrc(i, w, ratio && Math.round(w * ratio)))} ${w}w`).join(', ')}"` : '';
const absUrl = s => /^https?:/.test(s) ? s : BASE + s;
const UTM = 'utm_source=shmor&utm_medium=referral';
const credit = i => !i?.credit ? '' : `<p class="photo-credit">Photo: ${i.creditUrl ? `<a href="${esc(i.creditUrl)}?${UTM}" rel="nofollow noopener" target="_blank">${esc(i.credit)}</a>` : esc(i.credit)}${isUnsplash(i) ? ` on <a href="https://unsplash.com/?${UTM}" rel="nofollow noopener" target="_blank">Unsplash</a>` : ''}</p>`;
const cardImg = r => { const i = imgOf(r.image); return i ? `<img class="card-img" src="${esc(imgSrc(i, 600, 360))}"${imgSet(i, [400, 600, 900], .6)} sizes="(max-width: 640px) 100vw, 380px" width="600" height="360" alt="${esc(i.alt || '')}" loading="lazy" decoding="async">` : ''; };

function crumbs(p) {
  if (!p.slug) return [];
  const out = [{ name: 'Home', url: `${BASE}/`, path: '/' }];
  const parts = p.slug.split('/');
  for (let i = 1; i < parts.length; i++) {
    const parent = bySlug.get(parts.slice(0, i).join('/'));
    if (parent) out.push({ name: label(parent), url: pageUrl(parent), path: pagePath(parent) });
  }
  out.push({ name: label(p), url: pageUrl(p), path: pagePath(p) });
  return out;
}

/* ---------- Head: meta, social, structured data ---------- */
function head(p, { noindex = false, canonical = true } = {}) {
  const url = pageUrl(p);
  const im = imgOf(p.image || seo.image);
  const img = im && absUrl(imgSrc(im, 1200, 630));
  const graph = [];
  if (!p.slug) {
    graph.push({ '@type': 'WebSite', '@id': `${BASE}/#website`, url: `${BASE}/`, name: NAME, description: seo.description || p.description,
      publisher: { '@id': `${BASE}/#org` }, inLanguage: seo.locale || 'en',
      potentialAction: { '@type': 'SearchAction', target: `${BASE}/search/?q={search_term_string}`, 'query-input': 'required name=search_term_string' } });
    graph.push({ '@type': 'Organization', '@id': `${BASE}/#org`, name: NAME, url: `${BASE}/`,
      ...(seo.logo ? { logo: `${BASE}${seo.logo}` } : {}),
      parentOrganization: { '@type': 'Organization', name: 'Shmor.ai', url: `${MASTER}/` } });
  }
  graph.push({ '@type': 'WebPage', '@id': `${url}#page`, url, name: p.title, description: p.description,
    isPartOf: { '@id': `${BASE}/#website` }, dateModified: p.updated || TODAY, inLanguage: seo.locale || 'en',
    ...(p.reviewedBy ? { reviewedBy: person(p.reviewedBy), lastReviewed: p.reviewed } : {}) });
  const bc = crumbs(p);
  if (bc.length) graph.push({ '@type': 'BreadcrumbList', itemListElement: bc.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) });
  if (p.type === 'post') graph.push({ '@type': 'BlogPosting', '@id': `${url}#post`, mainEntityOfPage: { '@id': `${url}#page` },
    headline: p.h1, description: p.description, datePublished: p.date, dateModified: p.updated || p.date, inLanguage: seo.locale || 'en',
    ...(img ? { image: img } : {}), ...(p.keywords?.length ? { keywords: p.keywords.join(', ') } : {}),
    author: p.writtenBy ? person(p.writtenBy) : { '@type': 'Organization', name: `${NAME} editorial team`, url: `${BASE}/` },
    publisher: { '@type': 'Organization', name: NAME, url: `${BASE}/`, ...(seo.logo ? { logo: { '@type': 'ImageObject', url: `${BASE}${seo.logo}` } } : {}) } });
  if (p.type === 'blog') graph.push({ '@type': 'Blog', '@id': `${url}#blog`, url, name: p.h1, description: p.description,
    blogPost: posts.slice(0, 20).map(x => ({ '@type': 'BlogPosting', headline: x.h1, url: pageUrl(x), datePublished: x.date })) });
  if (p.faqs?.length) graph.push({ '@type': 'FAQPage', mainEntity: p.faqs.map(f => ({ '@type': 'Question', name: strip(f.q), acceptedAnswer: { '@type': 'Answer', text: strip(f.a) } })) });

  return [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    canonical ? `<link rel="canonical" href="${url}">` : '',
    noindex || p.noindex ? `<meta name="robots" content="noindex, follow">` : `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta property="og:type" content="${p.slug ? 'article' : 'website'}">`,
    p.type === 'post' ? `<meta property="article:published_time" content="${p.date}"><meta property="article:modified_time" content="${p.updated || p.date}">` : '',
    blogIndex && posts.length ? `<link rel="alternate" type="application/rss+xml" title="${esc(NAME)} ${esc(label(blogIndex))}" href="${pagePath(blogIndex)}feed.xml">` : '',
    `<meta property="og:site_name" content="${esc(NAME)}">`,
    `<meta property="og:title" content="${esc(p.ogTitle || p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${esc(seo.ogLocale || 'en_GB')}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    img && im.alt ? `<meta property="og:image:alt" content="${esc(im.alt)}">` : '',
    pages.some(x => imgOf(x.image) && isUnsplash(imgOf(x.image))) ? `<link rel="preconnect" href="https://images.unsplash.com">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<meta name="theme-color" content="${esc(seo.themeColor || '#0A0C0E')}">`,
    `<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="${esc(seo.fontsUrl || 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&display=swap')}" rel="stylesheet">`,
    `<link rel="stylesheet" href="/assets/site.css">`,
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`,
  ].filter(Boolean).join('\n');
}

/* ---------- Page sections ---------- */
const searchForm = (placeholder, cls = '') => `<form class="search ${cls}" action="/search/" role="search">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  <input name="q" type="search" placeholder="${esc(placeholder || seo.searchPlaceholder || 'What are you looking for?')}" aria-label="Search ${esc(NAME)}">
  <button type="submit">Search</button>
</form>`;

function hero(p) {
  const i = imgOf(p.image);
  const photo = i ? `<img class="hero-img" src="${esc(imgSrc(i, 1600, 0))}"${imgSet(i, [800, 1200, 1600, 2200])} sizes="100vw" alt="${esc(i.alt || '')}" fetchpriority="high" decoding="async">` : '';
  return `<section class="hero${p.slug ? ' hero-page' : ' hero-home'}${i ? ' has-img' : ''}">${photo}<div class="wrap">
  ${p.eyebrow ? `<p class="eyebrow">${esc(p.eyebrow)}</p>` : ''}
  <h1>${p.h1Html || esc(p.h1)}</h1>
  ${p.intro ? `<p class="lede">${p.intro}</p>` : ''}${p.heroHtml || ''}
  ${p.type === 'post' ? `<p class="post-byline">By ${byWho(p)}${p.reviewedBy ? ` · ${reviewedHtml(p)}` : ''} · <time datetime="${p.date}">${fmtDate(p.date)}</time>${p.updated && p.updated !== p.date ? ` · Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time>` : ''} · ${readMins(p)} min read</p>` : ''}
  ${p.search === false || (p.type === 'post' && p.search !== true) ? '' : searchForm(p.searchPlaceholder)}
  ${p.chips?.length ? `<div class="chips">${p.chips.map(c => `<a href="${c.slug !== undefined ? pagePath(bySlug.get(c.slug) || { slug: c.slug }) : `/search/?q=${encodeURIComponent(c.q)}`}">${esc(c.label)}</a>`).join('')}</div>` : ''}
</div>${p.slug ? '' : '<div class="hero-art" aria-hidden="true"></div>'}${credit(i)}</section>`;
}

function postCard(x) {
  return `<a class="card post-card${x.image ? ' has-img' : ''}" href="${pagePath(x)}">${cardImg(x)}<span class="post-meta"><time datetime="${x.date}">${fmtDate(x.date)}</time> · ${readMins(x)} min read</span><h3>${esc(x.h1)}</h3><p>${esc(x.cardText || x.description)}</p><span class="cta">Read more →</span></a>`;
}
function postList(p) {
  const n = p.type === 'blog' ? posts.length : p.latestPosts || 0;
  const list = posts.filter(x => x.slug !== p.slug).slice(0, n);
  if (!list.length) return '';
  const title = p.type === 'blog' ? (p.listTitle || 'Latest posts') : (p.latestTitle || `Latest from the ${blogIndex ? label(blogIndex).toLowerCase() : 'blog'}`);
  const more = p.type !== 'blog' && blogIndex && posts.length > list.length ? `<p class="more-link"><a href="${pagePath(blogIndex)}">See all posts →</a></p>` : '';
  return `<section class="related posts"><div class="wrap"><h2>${esc(title)}</h2><div class="grid">${list.map(postCard).join('')}</div>${more}</div></section>`;
}
function sources(p) {
  if (!p.sources?.length) return '';
  return `<section class="sources"><div class="wrap"><h2>${esc(p.sourcesTitle || 'Sources and official links')}</h2><ul>${p.sources.map(s =>
    `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a></li>`).join('')}</ul></div></section>`;
}

function breadcrumbHtml(p) {
  const bc = crumbs(p);
  if (!bc.length) return '';
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${bc.map((c, i) =>
    i === bc.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.path}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
}

function highlights(p) {
  if (!p.highlights?.length) return '';
  return `<section class="highlights"><div class="wrap">${p.highlightsTitle ? `<h2>${esc(p.highlightsTitle)}</h2>` : ''}<div class="grid">${p.highlights.map(h => `
    <div class="tile">${h.icon ? `<span class="tile-ico" aria-hidden="true">${h.icon}</span>` : ''}<h3>${esc(h.title)}</h3><p>${h.text}</p></div>`).join('')}</div></div></section>`;
}

/* Extra card sections from a page's "blocks": [{ type, title, intro, position: "top", items: [...] }].
   Types: strip (trust bar), deals (icon cards), tiles (photo mosaic), steps (numbered), links (pill links), people (profiles),
   specs (spec-sheet cards: item "mono", "kind", "specs": [[label, value]], "url" official site, "link" referral slug, "tag";
   block "tabs": [{ id, label }] adds filter buttons over the items by "tag"), meters (item "value" 0-100 + "valueLabel"),
   html (block "html": raw HTML). Any block can add "class" (extra CSS class on its section).
   Site-specific block types: if tools/blocks.js exists it exports { typeName: (block, page, kit) => html }
   (kit = helpers: esc, icon, pagePath, bySlug, goHref, LINKS, AFF, site, imgSrc, imgOf, errors).
   Item: { title, text, badge, icon (name below), slug | href | q, image (defaults to the linked page's), cta }. */
const ICONS = {
  scale: ['m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z', 'm2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z', 'M7 21h10', 'M12 3v18', 'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  receipt: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 17.5v-11'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  briefcase: ['M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16', 'M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  copyright: ['c:12,12,10', 'M14.83 14.83a4 4 0 1 1 0-5.66'],
  ship: ['M12 10.189V14', 'M12 2v3', 'M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6', 'M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76', 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1'],
  plane: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
  tag: ['M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z', 'c:7.5,7.5,1'],
  percent: ['M19 5 5 19', 'c:6.5,6.5,2.5', 'c:17.5,17.5,2.5'],
  clock: ['c:12,12,10', 'M12 6v6l4 2'],
  calendar: ['M8 2v4', 'M16 2v4', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 10h18'],
  gift: ['M4 8h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M12 8v13', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5'],
  wine: ['M8 22h8', 'M7 10h10', 'M12 15v7', 'M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z'],
  repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'c:9,7,4', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'c:12,7,4'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  search: ['c:11,11,8', 'm21 21-4.3-4.3'],
  compass: ['c:12,12,10', 'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z'],
  anchor: ['M12 22V8', 'M5 12H2a10 10 0 0 0 20 0h-3', 'c:12,5,3'],
  pin: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', 'c:12,10,3'],
  sun: ['c:12,12,4', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  paw: ['c:11,4,2', 'c:18,8,2', 'c:20,16,2', 'M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z', 'c:4,8,2'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  store: ['m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4', 'M2 7h20', 'M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7'],
  truck: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14', 'c:17,18,2', 'c:7,18,2'],
  stethoscope: ['M11 2v2', 'M5 2v2', 'M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1', 'M8 15a6 6 0 0 0 12 0v-3', 'c:20,10,2'],
  check: ['M20 6 9 17l-5-5'],
  droplet: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'],
  globe: ['c:12,12,10', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  wifi: ['M12 20h.01', 'M2 8.82a15 15 0 0 1 20 0', 'M5 12.859a10 10 0 0 1 14 0', 'M8.5 16.429a5 5 0 0 1 7 0'],
  smartphone: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  tv: ['M4 7h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'm17 2-5 5-5-5'],
  signal: ['M2 20h.01', 'M7 20v-4', 'M12 20v-8', 'M17 20V8', 'M22 4v16'],
  zap: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'],
  gauge: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  house: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  building: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4'],
  umbrella: ['M22 12a10.06 10.06 1 0 0-20 0Z', 'M12 12v8a2 2 0 0 0 4 0', 'M12 2v1'],
  car: ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', 'c:7,17,2', 'M9 17h6', 'c:17,17,2'],
  key: ['M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z', 'c:16.5,7.5,.5'],
  hardhat: ['M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5', 'M14 6a6 6 0 0 1 6 6v3', 'M4 15v-3a6 6 0 0 1 6-6', 'M2 16a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z'],
  laptop: ['M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z', 'M20.054 15.987H3.946'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  waves: ['M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1'],
  heartpulse: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z', 'M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27'],
  clipboard: ['M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'm9 14 2 2 4-4'],
  dish: ['M4 10a7.31 7.31 0 0 0 10 10Z', 'm9 15 3-3', 'M17 13a6 6 0 0 0-6-6', 'M21 13A10 10 0 0 0 11 3'],
};
const icon = name => !ICONS[name] ? '' : `<svg class="ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name].map(d =>
  d.startsWith('c:') ? (([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`)(d.slice(2).split(',')) : `<path d="${d}"/>`).join('')}</svg>`;
const itemHref = it => it.href || (it.slug !== undefined ? pagePath(bySlug.get(it.slug) || { slug: it.slug }) : it.q ? `/search/?q=${encodeURIComponent(it.q)}` : '');

// Guide byline bar (seo.bylines): who wrote it, legal review or fact-check note, date, editorial standards link
function byline(p) {
  if (!seo.bylines || !p.slug || p.type === 'post' || p.type === 'blog' || p.byline === false || p.slug === EDITORIAL) return '';
  const parts = [`Written by ${byWho(p)}`];
  if (p.reviewedBy) parts.push(reviewedHtml(p));
  else if (seo.checkedText) parts.push(esc(seo.checkedText));
  if (p.updated) parts.push(`Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time>`);
  if (EDITORIAL && bySlug.has(EDITORIAL)) parts.push(`<a href="/${EDITORIAL}/">${esc(seo.editorialLinkText || 'Editorial standards')}</a>`);
  return `\n<div class="byline${p.reviewedBy ? ' is-reviewed' : ''}"><div class="wrap">${icon(p.reviewedBy ? 'check' : 'file')}<p>${parts.join(' <span class="sep" aria-hidden="true">·</span> ')}</p></div></div>`;
}

function peopleBlock(b) {
  const ids = (b.items || Object.keys(PEOPLE)).filter(i => PEOPLE[i]);
  if (!ids.length) return '';
  const head = b.title ? `<div class="block-head"><h2>${esc(b.title)}</h2>${b.intro ? `<p>${b.intro}</p>` : ''}</div>` : '';
  return `<section class="blocks blocks-people"><div class="wrap">${head}<div class="grid people">${ids.map(i => {
    const x = PEOPLE[i], im = imgOf(x.image);
    return `<article class="person" id="person-${esc(i)}">${im ? `<img class="person-img" src="${esc(imgSrc(im, 240, 240))}" width="120" height="120" alt="${esc(im.alt || x.name)}" loading="lazy">` : ''}<h3>${esc(x.name)}</h3>${x.role ? `<p class="person-role">${esc(x.role)}</p>` : ''}${x.credentials ? `<p class="person-cred">${esc(x.credentials)}</p>` : ''}${x.bio ? `<p class="person-bio">${x.bio}</p>` : ''}${x.registry?.url ? `<p class="person-reg"><a href="${esc(x.registry.url)}" rel="noopener" target="_blank">${esc(x.registry.label || 'Check registration')}</a></p>` : ''}${(x.sameAs || []).length ? `<p class="person-links">${x.sameAs.map(u => `<a href="${esc(u)}" rel="noopener me" target="_blank">${esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`).join(' · ')}</p>` : ''}</article>`;
  }).join('')}</div></div></section>`;
}

function specCard(it, src) {
  const host = it.url ? new URL(it.url).hostname.replace(/^www\./, '') : '';
  const foot = [it.link && LINKS[it.link] ? `<a class="spec-go" href="${goHref(it.link, src)}" ${AFF}>${esc(it.cta || `See ${it.title} plans`)} →</a>` : '',
    it.href ? `<a class="spec-more" href="${esc(it.href)}">${esc(it.more || 'Read the guide')} →</a>` : '',
    host ? `<a class="spec-site" href="${esc(it.url)}" rel="nofollow noopener" target="_blank">${esc(host)} ↗</a>` : ''].filter(Boolean).join('');
  return `<article class="spec"${it.tag ? ` data-tag="${esc(it.tag)}"` : ''}>
  <div class="spec-head"><span class="spec-chip" aria-hidden="true">${esc(it.mono || it.title.slice(0, 2))}</span><div class="spec-id">${it.kind ? `<p class="spec-kind">${esc(it.kind)}</p>` : ''}<h3>${esc(it.title)}</h3></div>${it.badge ? `<span class="spec-badge">${esc(it.badge)}</span>` : ''}</div>
  ${it.text ? `<p class="spec-text">${it.text}</p>` : ''}${(it.specs || []).length ? `<dl class="spec-list">${it.specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
  ${foot ? `<div class="spec-foot">${foot}</div>` : ''}</article>`;
}

const CUSTOM = fs.existsSync(path.join(__dirname, 'blocks.js')) ? require('./blocks.js') : {};
function block(b, p = {}) {
  if (b.type === 'people') return peopleBlock(b);
  if (CUSTOM[b.type]) return CUSTOM[b.type](b, p, { esc, icon, pagePath, bySlug, goHref, LINKS, AFF, site, imgSrc, imgOf, errors });
  for (const it of b.items || []) if (it.link && !LINKS[it.link]) errors.push(`${p._file}: block item link "${it.link}" isn't in shmor-site.json "links"`);
  const items = (b.items || []).map(it => {
    const page = it.slug !== undefined ? bySlug.get(it.slug) : null;
    if (it.slug !== undefined && !page) console.warn(`  ! block item links to missing page "${it.slug}"`);
    return { ...it, page, href: itemHref(it), title: it.title || (page && label(page)) || '', text: it.text ?? (page && page.cardText) ?? '' };
  });
  const tag = (it, cls, inner) => it.href ? `<a class="${cls}" href="${esc(it.href)}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
  let body;
  if (b.type === 'strip') body = `<ul class="strip-list">${items.map(it => `<li>${icon(it.icon || 'check')}<span><strong>${esc(it.title)}</strong>${it.text ? ` ${esc(it.text)}` : ''}</span></li>`).join('')}</ul>`;
  else if (b.type === 'links') body = `<div class="pill-links">${items.map(it => tag(it, 'pill', `${it.icon ? icon(it.icon) : ''}${esc(it.title)}`)).join('')}</div>`;
  else if (b.type === 'tiles') body = `<div class="tiles">${items.map((it, n) => tag(it, `tile-photo${n === 0 && b.feature !== false ? ' tile-feature' : ''}`,
    `${cardImg({ image: it.image || (it.page && it.page.image) })}<span class="tile-shade"></span><span class="tile-body">${it.badge ? `<span class="tile-badge">${esc(it.badge)}</span>` : ''}<h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ''}</span>`)).join('')}</div>`;
  else if (b.type === 'html') body = b.html || '';
  else if (b.type === 'specs') body = `${b.tabs?.length ? `<div class="spec-tabs" data-tabs hidden>${[{ id: 'all', label: b.allLabel || 'All' }, ...b.tabs].map((t, n) =>
    `<button type="button" data-tab="${esc(t.id)}" aria-pressed="${n === 0}">${esc(t.label)}</button>`).join('')}</div>` : ''}<div class="spec-grid">${items.map(it => specCard(it, p.slug)).join('')}</div>`;
  else if (b.type === 'meters') body = `<div class="meters">${items.map(it => tag(it, 'meter',
    `<span class="meter-head">${it.icon ? icon(it.icon) : ''}<h3>${esc(it.title)}</h3>${it.valueLabel ? `<span class="meter-val">${esc(it.valueLabel)}</span>` : ''}</span><span class="meter-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, +it.value || 0))}%"></span></span>${it.text ? `<p>${it.text}</p>` : ''}${it.badge ? `<span class="meter-badge">${esc(it.badge)}</span>` : ''}`)).join('')}</div>`;
  else if (b.type === 'steps') body = `<ol class="steps">${items.map(it => `<li>${it.icon ? icon(it.icon) : ''}<h3>${esc(it.title)}</h3><p>${it.text}</p></li>`).join('')}</ol>`;
  else body = `<div class="grid deal-grid">${items.map(it => tag(it, 'deal',
    `<span class="deal-top">${icon(it.icon || 'tag')}${it.badge ? `<span class="deal-badge">${esc(it.badge)}</span>` : ''}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p>${it.href ? `<span class="cta">${esc(it.cta || 'Explore')} →</span>` : ''}`)).join('')}</div>`;
  const head = b.title ? `<div class="block-head"><h2>${esc(b.title)}</h2>${b.intro ? `<p>${b.intro}</p>` : ''}${b.more ? `<a class="block-more" href="${esc(itemHref(b.more))}">${esc(b.more.title)} →</a>` : ''}</div>` : '';
  return `<section class="blocks blocks-${esc(b.type || 'deals')}${b.class ? ` ${esc(b.class)}` : ''}"><div class="wrap">${head}${body}</div></section>`;
}
const blocks = (p, top) => (p.blocks || []).filter(b => (b.position === 'top') === top).map(b => block(b, p)).filter(Boolean).join('\n');

function partnerBlock(p) {
  const src = p.slug || 'home';
  const offers = (site.offers || []).filter(o => !o.pages || o.pages.includes(p.slug));
  const partners = (p.partners || []).map(slug => ({ slug, ...LINKS[slug] }));
  if (!offers.length && !partners.length) return '';
  return `<section class="partners"><div class="wrap">
  <h2>${esc(p.partnersTitle || 'Compare deals from our partners')}</h2>
  <div class="grid">
    ${offers.map(o => `<a class="offer" href="${goHref(o.link, src)}" ${AFF}>
      ${o.badge ? `<span class="badge">${esc(o.badge)}</span>` : ''}
      <span class="merchant">${esc(o.merchant || LINKS[o.link].merchant)}</span>
      <h3>${esc(o.title)}</h3>
      ${o.terms ? `<small>${esc(o.terms)}</small>` : ''}
      <span class="cta">View deal →</span></a>`).join('')}
    ${partners.map(l => `<a class="offer" href="${goHref(l.slug, src)}" ${AFF}>
      <span class="merchant">${esc(l.merchant)}</span>
      <h3>${esc(l.blurb || `Compare prices at ${l.merchant}`)}</h3>
      <span class="cta">Visit ${esc(l.merchant)} →</span></a>`).join('')}
  </div>
  <p class="aff-note">We may earn a commission if you book through these links, at no extra cost to you. <a href="${MASTER}/affiliate-disclosure/">How we make money</a>.</p>
</div></section>`;
}

function sections(p) {
  if (!p.sections?.length) return '';
  const toc = p.sections.length >= 4 ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ol>${p.sections.map(s => `<li><a href="#${slugify(s.h2)}">${esc(s.h2)}</a></li>`).join('')}</ol></nav>` : '';
  return `<section class="content"><div class="wrap content-grid">${toc}<article class="prose">${p.sections.map(s => `
    <h2 id="${slugify(s.h2)}">${esc(s.h2)}</h2>
    ${s.html}`).join('')}
    ${p.updated ? `<p class="updated">Last updated: ${new Date(p.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}
  </article></div></section>`;
}

function faqs(p) {
  if (!p.faqs?.length) return '';
  return `<section class="faq"><div class="wrap"><h2>${esc(p.faqTitle || 'Frequently asked questions')}</h2>${p.faqs.map(f => `
    <details><summary>${esc(f.q)}</summary><div>${f.a}</div></details>`).join('')}</div></section>`;
}

function related(p) {
  if (p.type === 'post' && !p.related) return postList({ ...p, latestPosts: 3, latestTitle: p.relatedTitle || `More from the ${blogIndex ? label(blogIndex).toLowerCase() : 'blog'}` });
  const list = (p.related || []).map(s => bySlug.get(s)).filter(Boolean);
  if (!list.length) return '';
  return `<section class="related"><div class="wrap"><h2>${esc(p.relatedTitle || 'Keep exploring')}</h2><div class="grid">${list.map(r => `
    <a class="card${r.image ? ' has-img' : ''}" href="${pagePath(r)}">${cardImg(r)}<h3>${esc(label(r))}</h3><p>${esc(r.cardText || r.description)}</p><span class="cta">Explore →</span></a>`).join('')}</div></div></section>`;
}

function bottomCta(p) {
  if (p.ctaSearch === false) return '';
  return `<section class="cta-band"><div class="wrap"><h2>${esc(p.ctaTitle || seo.ctaTitle || `Search ${NAME}`)}</h2>${searchForm(p.searchPlaceholder, 'search-lg')}</div></section>`;
}

/* ---------- Layout ---------- */
const layout = read('templates/layout.html');
// Top menu = pages with a navOrder (nav = their short label, also used in breadcrumbs)
const navPages = pages.filter(p => p.slug && p.navOrder !== undefined).sort((a, b) => a.navOrder - b.navOrder);
const navHtml = navPages.map(p => `<a href="${pagePath(p)}">${esc(label(p))}</a>`).join('');
const footerNav = pages.filter(p => p.slug && !p.noindex && p.type !== 'post').sort((a, b) => (a.navOrder ?? 99) - (b.navOrder ?? 99) || a.slug.localeCompare(b.slug))
  .map(p => `<li><a href="${pagePath(p)}">${esc(label(p))}</a></li>`).join('');

function render(p, main, opts) {
  const fill = {
    head: head(p, opts), nav: navHtml, main, footer_nav: footerNav,
    year: String(new Date().getFullYear()), site_name: esc(NAME),
    body_class: p.slug ? `page page-${p.slug.split('/')[0]}` : 'home',
  };
  return layout.replace(/{{([a-z_]+)}}/g, (m, k) => (k in fill ? fill[k] : m));
}
for (const k of ['head', 'main']) if (!layout.includes(`{{${k}}}`)) { console.error(`templates/layout.html must contain {{${k}}}`); process.exit(1); }

/* ---------- Write ---------- */
const MANIFEST = path.join(ROOT, '.build-manifest.json');
const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : [];
const written = [];
const out = (rel, text) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); written.push(rel); };

for (const p of pages) {
  const top = blocks(p, true), mid = blocks(p, false);
  const main = [breadcrumbHtml(p), hero(p) + byline(p) + (top && '\n' + top), postList(p), highlights(p) + (mid && '\n' + mid), partnerBlock(p), sections(p), faqs(p), sources(p), related(p), bottomCta(p)].join('\n');
  out(p.slug ? `${p.slug}/index.html` : 'index.html', render(p, main));
}

// Search (noindex) + index of pages
const searchPage = { slug: 'search', title: `Search | ${NAME}`, description: `Search ${NAME}.`, h1: `Search ${NAME}` };
out('search/index.html', render(searchPage, `<section class="hero hero-page"><div class="wrap"><h1 id="search-title">Search ${esc(NAME)}</h1>${searchForm()}</div></section>
<section class="related"><div class="wrap"><div class="grid" id="search-results" aria-live="polite"></div></div></section>`, { noindex: true, canonical: false }));
out('search-index.json', JSON.stringify(pages.filter(p => !p.noindex).map(p => ({
  path: pagePath(p), title: label(p), text: p.cardText || p.description, img: p.image ? imgSrc(imgOf(p.image), 600, 360) : '', terms: [p.title, p.h1, p.description, ...(p.keywords || [])].join(' ').toLowerCase(),
}))));

// 404
out('404.html', render({ slug: '404', title: `Page not found | ${NAME}`, description: `This page could not be found on ${NAME}.`, h1: 'Page not found', nav: 'Not found' },
  `<section class="hero hero-page"><div class="wrap"><h1>We couldn't find that page</h1><p class="lede">Try a search, or head back to the <a href="/">${esc(NAME)} homepage</a>.</p>${searchForm()}</div></section>`,
  { noindex: true, canonical: false }));

// Sitemap + robots
const indexable = pages.filter(p => !p.noindex);
if (blogIndex && posts.length) {
  const x = s => esc(strip(s));
  out(`${blogIndex.slug}/feed.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n<title>${x(`${NAME}: ${label(blogIndex)}`)}</title><link>${pageUrl(blogIndex)}</link><description>${x(blogIndex.description)}</description><language>${esc(seo.locale || 'en')}</language>\n<atom:link href="${pageUrl(blogIndex)}feed.xml" rel="self" type="application/rss+xml"/>\n${posts.slice(0, 30).map(p =>
    `<item><title>${x(p.h1)}</title><link>${pageUrl(p)}</link><guid>${pageUrl(p)}</guid><pubDate>${new Date(p.date + 'T08:00:00Z').toUTCString()}</pubDate><description>${x(p.description)}</description></item>`).join('\n')}\n</channel></rss>\n`);
}
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(p =>
  `  <url><loc>${pageUrl(p)}</loc><lastmod>${p.updated || p.date || TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`);
out('robots.txt', `User-agent: *\nAllow: /\nDisallow: /search/\n\nSitemap: ${BASE}/sitemap.xml\n`);

// Remove pages that no longer exist
for (const rel of previous) {
  if (!written.includes(rel) && rel.endsWith('index.html') && fs.existsSync(path.join(ROOT, rel))) {
    fs.unlinkSync(path.join(ROOT, rel));
    try { fs.rmdirSync(path.dirname(path.join(ROOT, rel))); } catch (e) { /* folder not empty */ }
    console.log(`  removed old page /${path.dirname(rel)}/`);
  }
}
if (errors.length) { console.error('\nBuild problems:\n  ✗ ' + errors.join('\n  ✗ ')); process.exitCode = 1; }
fs.writeFileSync(MANIFEST, JSON.stringify(written, null, 2));
console.log(`✓ Built ${NAME}: ${pages.length} pages, sitemap with ${indexable.length} URLs → ${BASE}/`);

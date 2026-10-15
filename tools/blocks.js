/* HotelHero: site-specific block types (loaded by tools/build.js).
   Booking sites to compare live in shmor-site.json "providers":
     { id, name, color, url, urlNoDates, home, note, link? }
   url placeholders: {q} destination (URL-encoded), {qp} destination for paths (spaces → -),
   {in} {out} dates (YYYY-MM-DD), {adults}, {rooms}. "link" = a referral slug in "links":
   once it exists, that provider's buttons go through shmor.ai/go/ instead (tracked). */
const fill = (t, v) => t.replace(/{(q|qp|in|out|adults|rooms)}/g, (m, k) =>
  k === 'q' ? encodeURIComponent(v.q || '') : k === 'qp' ? encodeURIComponent(String(v.q || '').trim().replace(/\s+/g, '-')) : (v[k] ?? ''));
const provHref = (p, q, kit, src) => p.link && kit.LINKS[p.link] ? kit.goHref(p.link, src)
  : q ? fill(p.urlNoDates || p.url, { q }) : p.home;
const provRel = (p, kit) => p.link && kit.LINKS[p.link] ? kit.AFF : 'rel="nofollow noopener" target="_blank"';
const compareHref = q => `/compare/?q=${encodeURIComponent(q)}`;

// Deal grid: big photo cards with badge, place, tags, quick "check on" links and a compare button
function hotels(b, page, kit) {
  const { esc, icon, imgSrc, imgOf, pagePath, bySlug, site } = kit;
  const provs = (site.providers || []).slice(0, b.quick ?? 3);
  const total = (site.providers || []).length;
  const cards = (b.items || []).map(it => {
    const q = it.q || it.place || it.title;
    const im = imgOf(it.image || (it.slug !== undefined && bySlug.get(it.slug)?.image));
    if (it.slug !== undefined && !bySlug.get(it.slug)) kit.errors.push(`${page._file}: hotels block links to missing page "${it.slug}"`);
    const guide = it.slug !== undefined && bySlug.get(it.slug) ? pagePath(bySlug.get(it.slug)) : '';
    const main = guide || compareHref(q);
    const img = im ? `<img src="${esc(imgSrc(im, 640, 420))}" srcset="${esc(imgSrc(im, 420, 276))} 420w, ${esc(imgSrc(im, 640, 420))} 640w, ${esc(imgSrc(im, 900, 590))} 900w" sizes="(max-width: 640px) 100vw, 300px" width="640" height="420" alt="${esc(im.alt || '')}" loading="lazy" decoding="async">` : '';
    return `<article class="hh-card">
  <a class="hh-photo" href="${esc(main)}" tabindex="-1" aria-hidden="true">${img}${it.badge ? `<span class="hh-badge">${esc(it.badge)}</span>` : ''}<span class="hh-count">${icon('search')}${total} sites</span></a>
  <div class="hh-body">
    ${it.place ? `<p class="hh-place">${icon('pin')}${esc(it.place)}</p>` : ''}
    <h3><a href="${esc(main)}">${esc(it.title)}</a></h3>
    ${it.text ? `<p class="hh-text">${esc(it.text)}</p>` : ''}
    ${(it.tags || []).length ? `<ul class="hh-tags">${it.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <div class="hh-quick"><span>Check on</span>${provs.map(p => `<a href="${esc(provHref(p, q, kit, page.slug))}" ${provRel(p, kit)} style="--pc:${esc(p.color)}">${esc(p.name)}</a>`).join('')}</div>
    <a class="hh-go" href="${esc(compareHref(q))}">Compare ${total} sites <span aria-hidden="true">→</span></a>
  </div>
</article>`;
  }).join('\n');
  const head = b.title ? `<div class="block-head"><h2>${esc(b.title)}</h2>${b.intro ? `<p>${b.intro}</p>` : ''}${b.more ? `<a class="block-more" href="${esc(b.more.href || pagePath(bySlug.get(b.more.slug) || { slug: b.more.slug }))}">${esc(b.more.title)} →</a>` : ''}</div>` : '';
  return `<section class="blocks blocks-hotels${b.class ? ` ${esc(b.class)}` : ''}"><div class="wrap">${head}<div class="hh-grid">${cards}</div></div></section>`;
}

// "We compare" strip of booking-site wordmarks
function providers(b, page, kit) {
  const list = kit.site.providers || [];
  return `<section class="blocks blocks-providers${b.class ? ` ${kit.esc(b.class)}` : ''}"><div class="wrap"><p class="hh-we">${kit.esc(b.title || 'We compare prices from')}</p><ul class="hh-logos">${list.map(p =>
    `<li style="--pc:${kit.esc(p.color)}">${kit.esc(p.name)}</li>`).join('')}</ul></div></section>`;
}

// /compare/ results: assets/site.js fills #hh-results from the query; the static list works without JavaScript
function compare(b, page, kit) {
  const { esc } = kit;
  const list = kit.site.providers || [];
  const data = list.map(p => ({ id: p.id, name: p.name, color: p.color, note: p.note || '',
    url: p.link && kit.LINKS[p.link] ? '' : p.url, urlNoDates: p.link && kit.LINKS[p.link] ? '' : (p.urlNoDates || p.url),
    go: p.link && kit.LINKS[p.link] ? kit.goHref(p.link, 'compare') : '', home: p.home }));
  return `<section class="blocks blocks-compare"><div class="wrap">
  <div class="hh-res-head"><h2 id="hh-res-title">${esc(b.title || 'Compare hotel prices on every site')}</h2><p id="hh-res-sub">${b.intro || 'Enter a destination and dates above, then open each site to see its live prices for the same stay.'}</p></div>
  <ol class="hh-results" id="hh-results"${kit.site.priceApi ? ` data-price-api="${esc(kit.site.priceApi)}"` : ''}>${list.map((p, n) => `<li class="hh-row" style="--pc:${esc(p.color)}"><span class="hh-rank">${n + 1}</span><span class="hh-mark">${esc(p.name)}</span><span class="hh-note">${esc(p.note || '')}</span><a class="hh-open" href="${esc(provHref(p, '', kit, 'compare'))}" ${provRel(p, kit)}>Visit ${esc(p.name)} ↗</a></li>`).join('')}</ol>
  <p class="aff-note">Prices are set by each booking site and change often. Always check the total (taxes, fees, breakfast and cancellation terms) before you book. Some links may be affiliate links, at no extra cost to you. <a href="https://shmor.ai/affiliate-disclosure/">How we make money</a>.</p>
  <script type="application/json" id="hh-providers">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</div></section>`;
}

module.exports = { hotels, providers, compare };

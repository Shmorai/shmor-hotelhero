/* Shmor site kit: menu toggle + on-site search (pages are found via /search-index.json) */
(function () {
  'use strict';
  var btn = document.querySelector('[data-menu]'), nav = document.querySelector('[data-nav]');
  if (btn && nav) btn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });

  var out = document.getElementById('search-results');
  if (!out) return;
  var q = (new URLSearchParams(location.search).get('q') || '').trim();
  var input = document.querySelector('.search input[name=q]');
  if (input) input.value = q;
  if (!q) return;
  document.getElementById('search-title').textContent = 'Results for “' + q + '”';
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var words = q.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 1; });
  fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (pages) {
    var hits = pages.map(function (p) {
      var score = words.reduce(function (s, w) { return s + (p.terms.indexOf(w) > -1 ? 1 : 0); }, 0);
      return { p: p, score: score };
    }).filter(function (h) { return h.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    out.innerHTML = hits.length
      ? hits.map(function (h) { return '<a class="card' + (h.p.img ? ' has-img' : '') + '" href="' + h.p.path + '">' + (h.p.img ? '<img class="card-img" src="' + esc(h.p.img) + '" alt="" loading="lazy" width="600" height="360">' : '') + '<h3>' + esc(h.p.title) + '</h3><p>' + esc(h.p.text) + '</p><span class="cta">Explore →</span></a>'; }).join('')
      : '<p class="empty">No pages matched. Try a broader search, or browse the guides below.</p>' +
        pages.slice(0, 6).map(function (p) { return '<a class="card" href="' + p.path + '"><h3>' + esc(p.title) + '</h3><p>' + esc(p.text) + '</p></a>'; }).join('');
  }).catch(function () { out.innerHTML = '<p class="empty">Search is unavailable right now.</p>'; });
})();

/* "specs" blocks with "tabs": filter the cards by data-tag (every card shows without JS) */
(function () {
  'use strict';
  document.querySelectorAll('[data-tabs]').forEach(function (bar) {
    var grid = bar.nextElementSibling;
    bar.hidden = false;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      var id = b.getAttribute('data-tab');
      bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      grid.querySelectorAll('[data-tag]').forEach(function (c) { c.hidden = id !== 'all' && c.getAttribute('data-tag') !== id; });
    });
  });
})();

/* Fold the top menu into the menu button whenever it doesn't fit (any screen width) */
(function () {
  'use strict';
  var root = document.documentElement, bar = document.querySelector('.site-header .bar'), nav = document.querySelector('[data-nav]');
  if (!bar || !nav) return;
  function fit() {
    root.classList.remove('nav-compact');
    nav.classList.remove('open');
    if (getComputedStyle(nav).display === 'none') return; // phone layout already uses the menu button
    var over = bar.scrollWidth > bar.clientWidth + 1 || nav.scrollWidth > nav.clientWidth + 1 ||
      nav.getBoundingClientRect().right > bar.getBoundingClientRect().right + 1;
    if (over) root.classList.add('nav-compact');
  }
  fit();
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();

/* HotelHero: compare form (dates default to the coming weekend), /compare/ results, and a
   "compare prices" shortcut on the /search/ page. Booking sites come from shmor-site.json
   "providers", embedded in the /compare/ page by tools/blocks.js. */
(function () {
  'use strict';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var params = new URLSearchParams(location.search);

  // Defaults: next Friday to Sunday (or tonight if it's already the weekend)
  var fri = addDays(today, (5 - today.getDay() + 7) % 7);
  var defIn = params.get('in') || iso(fri), defOut = params.get('out') || iso(addDays(parse(defIn) || fri, 2));

  Array.prototype.forEach.call(document.querySelectorAll('form[data-compare]'), function (f) {
    var din = f.elements['in'], dout = f.elements['out'], q = f.elements['q'];
    if (params.get('q') && q && location.pathname.indexOf('/compare/') === 0) q.value = params.get('q');
    ['adults', 'rooms'].forEach(function (k) { if (params.get(k) && f.elements[k]) f.elements[k].value = params.get(k); });
    if (din && !din.value) din.value = defIn;
    if (dout && !dout.value) dout.value = defOut;
    if (din) din.min = iso(today);
    var sync = function () {
      var a = parse(din.value);
      if (!a) return;
      dout.min = iso(addDays(a, 1));
      var b = parse(dout.value);
      if (!b || b <= a) dout.value = iso(addDays(a, 1));
    };
    if (din && dout) { din.addEventListener('change', sync); sync(); }
  });

  // /compare/: one row per booking site with a deep link for the same stay
  var out = document.getElementById('hh-results'), dataEl = document.getElementById('hh-providers');
  var q = (params.get('q') || '').trim();
  if (out && dataEl && q) {
    var v = { q: q, 'in': params.get('in') || '', out: params.get('out') || '', adults: params.get('adults') || '2', rooms: params.get('rooms') || '1' };
    if (!parse(v['in']) || !parse(v.out) || parse(v.out) <= parse(v['in'])) { v['in'] = ''; v.out = ''; }
    var fill = function (t) {
      return t.replace(/{(q|qp|in|out|adults|rooms)}/g, function (m, k) {
        return k === 'q' ? encodeURIComponent(v.q) : k === 'qp' ? encodeURIComponent(v.q.replace(/\s+/g, '-')) : encodeURIComponent(v[k] || '');
      });
    };
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var fmt = function (s) { return parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
    var nights = v['in'] ? Math.round((parse(v.out) - parse(v['in'])) / 864e5) : 0;
    var provs = JSON.parse(dataEl.textContent);
    document.getElementById('hh-res-title').textContent = 'Hotels in ' + q + ': compare ' + provs.length + ' sites';
    document.getElementById('hh-res-sub').textContent = (v['in'] ? fmt(v['in']) + ' – ' + fmt(v.out) + ' · ' + nights + ' night' + (nights > 1 ? 's' : '') + ' · ' : '') +
      v.adults + ' guest' + (v.adults > 1 ? 's' : '') + ', ' + v.rooms + ' room' + (v.rooms > 1 ? 's' : '') + '. Each button opens that site’s live prices for the same stay in a new tab.';
    out.innerHTML = provs.map(function (p, n) {
      var href = p.go || fill(v['in'] && p.url ? p.url : p.urlNoDates || p.home);
      var rel = p.go ? 'sponsored nofollow noopener' : 'nofollow noopener';
      return '<li class="hh-row" style="--pc:' + esc(p.color) + '"><span class="hh-rank">' + (n + 1) + '</span><span class="hh-mark">' + esc(p.name) + '</span><span class="hh-note">' + esc(p.note) +
        '</span><a class="hh-open" href="' + esc(href) + '" rel="' + rel + '" target="_blank" data-open>Search ' + esc(p.name) + ' ↗</a></li>';
    }).join('');
    out.classList.add('is-live');
    // Tick off the sites already opened, so it's easy to work down the list
    out.addEventListener('click', function (e) { var a = e.target.closest('[data-open]'); if (a) a.closest('.hh-row').classList.add('is-done'); });
  }

  // /search/: offer a straight price comparison for the search term
  var sr = document.getElementById('search-results'), sq = (params.get('q') || '').trim();
  if (sr && sq) {
    var p = document.createElement('p');
    p.className = 'hh-search-cta';
    var a = document.createElement('a');
    a.href = '/compare/?q=' + encodeURIComponent(sq.replace(/\b(hotels?|deals?|cheap)\b/gi, '').replace(/\s+/g, ' ').trim() || sq);
    a.textContent = 'Compare hotel prices for “' + sq + '” on every booking site →';
    p.appendChild(a);
    sr.parentNode.insertBefore(p, sr);
  }
})();

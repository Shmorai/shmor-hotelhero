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
    document.getElementById('hh-res-title').textContent = 'Hotels in ' + q.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ': compare ' + provs.length + ' sites';
    document.getElementById('hh-res-sub').textContent = (v['in'] ? fmt(v['in']) + ' – ' + fmt(v.out) + ' · ' + nights + ' night' + (nights > 1 ? 's' : '') + ' · ' : '') +
      v.adults + ' guest' + (v.adults > 1 ? 's' : '') + ', ' + v.rooms + ' room' + (v.rooms > 1 ? 's' : '') + '. Each button opens that site’s live prices for the same stay in a new tab.';
    out.innerHTML = provs.map(function (p, n) {
      var href = p.go || fill(v['in'] && p.url ? p.url : p.urlNoDates || p.home);
      var rel = p.go ? 'sponsored nofollow noopener' : 'nofollow noopener';
      return '<li class="hh-row" style="--pc:' + esc(p.color) + '"><span class="hh-rank">' + (n + 1) + '</span><span class="hh-mark">' + esc(p.name) + '</span><span class="hh-note">' + esc(p.note) +
        '</span><a class="hh-open" href="' + esc(href) + '" rel="' + rel + '" target="_blank" data-open>See live prices ↗</a></li>';
    }).join('');
    out.classList.add('is-live');
    // Tick off the sites already opened, so it's easy to work down the list
    out.addEventListener('click', function (e) { var a = e.target.closest('[data-open]'); if (a) a.closest('.hh-row').classList.add('is-done'); });

    /* Top hotels: REAL hotels for this destination from assets/hotels.json (OpenStreetMap + Wikidata,
       made by tools/fetch-hotels.js). Each gets "Live price" buttons that open that hotel on each site
       with the same dates.
       LIVE PRICES (switched off until a booking site approves us): when shmor-site.json "priceApi" is set
       (the URL of worker/, our Cloudflare Worker that calls the Booking.com / Expedia partner APIs), the
       page asks it for real prices for these dates first and shows them in the same cards. If it's not set,
       fails or returns nothing, the page works exactly as before. Prices are never made up here. */
    var HOTEL_SITES = ['booking', 'hotelscom', 'expedia', 'google'];
    // Free-licence Unsplash hotel photos for hotels with no photo of their own (labelled "Illustrative photo")
    var STOCK = ['photo-1611892440504-42a792e24d32', 'photo-1618773928121-c32242e63f39', 'photo-1621293954908-907159247fc8', 'photo-1566665797739-1674de7a421a',
      'photo-1496417263034-38ec4f0b665a', 'photo-1761039265583-9489b4246454', 'photo-1631049307264-da0ec9d70304', 'photo-1584622650111-993a426fbf0a', 'photo-1625244724120-1fd1d34d00f6'];
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(hotels?|deals?|cheap|uk|in|near)\b/g, ' ').replace(/\s+/g, ' ').trim(); };
    // Not in the saved list? Ask OpenStreetMap's free Nominatim search for hotels there (cached in this browser for 2 weeks)
    var live = function (q) {
      var ck = 'hh-hotels:' + norm(q), hit = null;
      try { hit = JSON.parse(localStorage.getItem(ck)); } catch (e) { /* storage blocked */ }
      if (hit && hit.t > Date.now() - 12096e5) return Promise.resolve(hit.place);
      return fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent('hotels in ' + q) + '&countrycodes=gb&format=jsonv2&limit=30&extratags=1&addressdetails=1')
        .then(function (r) { return r.json(); }).then(function (rows) {
          var seen = {}, list = rows.filter(function (x) { return x.type === 'hotel' && x.name && !seen[x.name.toLowerCase()] && (seen[x.name.toLowerCase()] = 1); }).map(function (x) {
            var t = x.extratags || {}, a = x.address || {}, st = parseFloat(t.stars);
            return { name: x.name, stars: st >= 1 && st <= 5 ? st : undefined, area: a.road || a.suburb, wd: t.wikidata, s: (st || 0) * 10 + (t.wikidata ? 6 : 0) + (x.name.split(' ').length > 1 ? 2 : 0) + (t.website ? 1 : 0) };
          }).sort(function (a, b) { return b.s - a.s; }).slice(0, 6);
          var town = rows[0] && rows[0].address ? rows[0].address.city || rows[0].address.town || rows[0].address.village : '';
          var place = { q: town || q.replace(/\b\w/g, function (c) { return c.toUpperCase(); }), hotels: list };
          // Photos for hotels that have a Wikidata entry (free licences on Wikimedia Commons)
          return Promise.all(list.map(function (h) {
            if (!h.wd) return null;
            return fetch('https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=' + h.wd + '&property=P18&format=json&origin=*').then(function (r) { return r.json(); }).then(function (j) {
              var f = j.claims && j.claims.P18 && j.claims.P18[0].mainsnak.datavalue.value;
              if (f) { f = encodeURIComponent(f.replace(/ /g, '_')); h.photo = { src: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + f + '?width=640', page: 'https://commons.wikimedia.org/wiki/File:' + f }; }
            }).catch(function () {});
          })).then(function () {
            list.forEach(function (h) { delete h.wd; delete h.s; });
            if (list.length) try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), place: place })); } catch (e) { /* ignore */ }
            return place;
          });
        });
    };
    var api = out.getAttribute('data-price-api') || '';
    var livePrices = function () {
      if (!api || !v['in']) return Promise.resolve(null); // prices need dates
      var ctl = window.AbortController ? new AbortController() : null;
      if (ctl) setTimeout(function () { ctl.abort(); }, 8000);
      return fetch(api.replace(/\/$/, '') + '/prices?' + new URLSearchParams({ q: q, 'in': v['in'], out: v.out, adults: v.adults, rooms: v.rooms }), ctl ? { signal: ctl.signal } : {})
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return d && d.hotels && d.hotels.length ? { q: d.place || q, hotels: d.hotels.slice(0, 6), priced: true, sources: d.sources || [] } : null; })
        .catch(function () { return null; });
    };
    livePrices().then(function (pp) {
      if (pp) return pp;
      return fetch('/assets/hotels.json').then(function (r) { return r.json(); }).catch(function () { return { places: {} }; }).then(function (data) {
      var k = norm(q), place = data.places[k];
      if (!place) Object.keys(data.places).some(function (pk) { var n = norm(pk); if (n && (k.indexOf(n) === 0 || n.indexOf(k) === 0)) { place = data.places[pk]; return true; } return false; });
      return place && place.hotels.length ? place : live(q);
      });
    }).then(function (place) {
      if (!place || !place.hotels.length) return;
      var sites = provs.filter(function (p) { return HOTEL_SITES.indexOf(p.id) > -1 && (p.go || p.url); });
      var stars = function (n) { return n ? '<span class="hh-stars" title="' + n + '-star hotel (OpenStreetMap)">' + new Array(Math.floor(n) + 1).join('★') + '</span>' : ''; };
      var card = function (h, n) {
        var vq = { q: h.name + ', ' + place.q };
        var link = function (p) {
          if (p.go) return p.go;
          var t = v['in'] && p.url ? p.url : p.urlNoDates || p.url;
          return t.replace(/{(q|qp|in|out|adults|rooms)}/g, function (m, x) { return x === 'q' ? encodeURIComponent(vq.q) : x === 'qp' ? encodeURIComponent(vq.q.replace(/\s+/g, '-')) : encodeURIComponent(v[x] || ''); });
        };
        var offers = {}, best = null;
        (h.offers || []).forEach(function (o) { if (o.price > 0 && o.url) { offers[o.site] = o; if (!best || o.price < best.price) best = o; } });
        var money = function (o) { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: o.currency || 'GBP', maximumFractionDigits: o.price % 1 ? 2 : 0 }).format(o.price); } catch (e) { return '£' + o.price; } };
        var order = sites.slice().sort(function (a, b) { var x = offers[a.id], y = offers[b.id]; return x && y ? x.price - y.price : x ? -1 : y ? 1 : 0; });
        var stock = STOCK[[].reduce.call(h.name, function (t, c) { return t + c.charCodeAt(0); }, 0) % STOCK.length];
        var img = h.photo ? '<img src="' + esc(h.photo.src) + '" alt="' + esc(h.name) + '" loading="lazy" width="640" height="420">'
          : '<img src="https://images.unsplash.com/' + stock + '?w=640&h=360&fit=crop&q=70&auto=format" alt="" loading="lazy" width="640" height="360"><span class="hh-illus">Illustrative photo</span>';
        return '<article class="hh-hotel' + (n > 2 ? ' is-more' : '') + '"><div class="hh-hotel-img">' + img + (best ? '<span class="hh-badge">From ' + esc(money(best)) + '</span>' : n === 0 ? '<span class="hh-badge">Popular pick</span>' : '') +
          (h.photo && h.photo.page ? '<a class="hh-hotel-credit" href="' + esc(h.photo.page) + '" rel="nofollow noopener" target="_blank">Photo: ' + esc(h.photo.credit || 'Wikimedia Commons') + '</a>' : h.photo && h.photo.credit ? '<span class="hh-hotel-credit">Photo: ' + esc(h.photo.credit) + '</span>' : '') + '</div>' +
          '<div class="hh-hotel-body">' + stars(h.stars) + '<h3>' + esc(h.name) + '</h3><p class="hh-place">' + esc((h.area ? h.area + ', ' : '') + place.q) + '</p>' +
          '<ul class="hh-hprices">' + order.map(function (p) {
            var o = offers[p.id];
            if (o) return '<li class="has-price' + (o === best && Object.keys(offers).length > 1 ? ' is-best' : '') + '" style="--pc:' + esc(p.color) + '"><a href="' + esc(o.url) + '" rel="sponsored nofollow noopener" target="_blank"><span class="hh-hp-name">' + esc(p.name) +
              (o === best && Object.keys(offers).length > 1 ? '<small>Best price</small>' : '') + '</span><span class="hh-hp-price">' + esc(money(o)) + '</span><span class="hh-hp-go">View deal ↗</span></a></li>';
            return '<li style="--pc:' + esc(p.color) + '"><a href="' + esc(link(p)) + '" rel="' + (p.go ? 'sponsored ' : '') + 'nofollow noopener" target="_blank"><span class="hh-hp-name">' + esc(p.name) + '</span><span class="hh-hp-go">Live price ↗</span></a></li>';
          }).join('') + '</ul></div></article>';
      };
      var sec = document.createElement('div');
      sec.className = 'hh-top';
      sec.innerHTML = '<div class="hh-top-head"><h3>' + (place.priced ? 'Hotel prices in ' : 'Top hotels in ') + esc(place.q) + '</h3><p>' + (place.priced ? 'Live prices for your dates. ' : '') + 'Tap a site to see its live price for ' + (v['in'] ? 'your dates' : 'this hotel') + ' in a new tab. Sites often charge different amounts for the same room, so it pays to check two or three.</p></div>' +
        '<div class="hh-hotels">' + place.hotels.map(card).join('') + '</div>' +
        (place.hotels.length > 3 ? '<button type="button" class="hh-more">Show ' + (place.hotels.length - 3) + ' more hotels</button>' : '') +
        (place.priced ? '<p class="hh-src">Prices from ' + esc((place.sources || []).join(' and ') || 'our booking partners') + ' for your dates (' + nights + ' night' + (nights > 1 ? 's' : '') + ', ' + v.adults + ' guest' + (v.adults > 1 ? 's' : '') + '), checked when you searched. Prices can change: the final price is on the booking site.</p>'
          : '<p class="hh-src">Hotel list: <a href="https://www.openstreetmap.org/copyright" rel="nofollow noopener" target="_blank">© OpenStreetMap contributors</a>. Not a price or quality ranking. Prices are set by each booking site. Photos: Wikimedia Commons, or illustrative photos from Unsplash.</p>');
      out.parentNode.insertBefore(sec, out);
      var more = sec.querySelector('.hh-more');
      if (more) more.addEventListener('click', function () { sec.classList.add('show-all'); more.remove(); });
    }).catch(function () { /* no hotel list: the site list below still works */ });
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

/* HotelHero price worker (Cloudflare Workers, free plan is enough to start).
   GET /prices?q=York&in=2026-11-20&out=2026-11-22&adults=2&rooms=1
   → { place, sources: ["Booking.com"], hotels: [{ name, stars, area, photo: { src, credit }, offers: [{ site, price, currency, url }] }] }

   SWITCHED OFF until Booking.com approves HotelHero for its Demand API: with no BOOKING_* secrets it
   returns { hotels: [] } and the site keeps its normal "Live price" buttons. It never invents prices:
   every price comes straight from the partner API response for the visitor's exact dates and guests.

   UNTESTED against the live API (no access yet). When access arrives, check the request/response field
   names in bookingSearch() and bookingDetails() against https://developers.booking.com/demand/docs and
   test with the sandbox (BOOKING_BASE = https://demandapi-sandbox.booking.com/3.1) before going live.

   Expedia / Hotels.com: their price API (Rapid) is for partners who take bookings on their own site,
   not click-out affiliates, so it isn't wired in. Their cards keep the "Live price" deep links. */

const UA = 'HotelHero/1.0 (https://hotelhero.shmor.ai)';
const json = (data, status, cors) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', ...cors } });
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://hotelhero.shmor.ai').split(',').map(s => s.trim());
    const cors = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (url.pathname !== '/prices') return json({ error: 'not found' }, 404, cors);

    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const p = { checkin: url.searchParams.get('in'), checkout: url.searchParams.get('out'),
      adults: Math.min(8, Math.max(1, +url.searchParams.get('adults') || 2)), rooms: Math.min(4, Math.max(1, +url.searchParams.get('rooms') || 1)) };
    if (!q || !isDate(p.checkin) || !isDate(p.checkout) || p.checkout <= p.checkin) return json({ hotels: [] }, 200, cors);
    if (!env.BOOKING_AFFILIATE_ID || !env.BOOKING_TOKEN) return json({ hotels: [], note: 'price feed not configured' }, 200, cors);

    // Same search from many visitors → serve from Cloudflare's cache for 15 minutes
    const cache = caches.default, key = new Request(`https://cache.hotelhero/${encodeURIComponent(q.toLowerCase())}/${p.checkin}/${p.checkout}/${p.adults}/${p.rooms}`);
    const hit = await cache.match(key);
    if (hit) { const r = new Response(hit.body, hit); Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v)); return r; }

    try {
      const geo = await geocode(q);
      if (!geo) return json({ hotels: [] }, 200, cors);
      const found = await bookingSearch(env, geo, p);
      const details = found.length ? await bookingDetails(env, found.map(f => f.id)) : {};
      const hotels = found.filter(f => details[f.id]).map(f => ({ ...details[f.id], offers: [{ site: 'booking', price: f.price, currency: f.currency, url: f.url }] }));
      const res = json({ place: geo.name, sources: hotels.length ? ['Booking.com'] : [], hotels }, 200, {});
      ctx.waitUntil(cache.put(key, res.clone()));
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      return json({ hotels: [], error: 'price feed unavailable' }, 200, cors); // the page falls back to its normal cards
    }
  },
};

async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=gb&format=jsonv2&limit=1&addressdetails=1`, { headers: { 'User-Agent': UA } });
  const [g] = await r.json();
  if (!g) return null;
  const a = g.address || {};
  return { lat: +g.lat, lon: +g.lon, name: a.city || a.town || a.village || g.name || q };
}

const bookingHeaders = env => ({ Authorization: `Bearer ${env.BOOKING_TOKEN}`, 'X-Affiliate-Id': String(env.BOOKING_AFFILIATE_ID), 'Content-Type': 'application/json', Accept: 'application/json' });
const bookingBase = env => (env.BOOKING_BASE || 'https://demandapi.booking.com/3.1').replace(/\/$/, '');

// Accommodation search near the destination for the visitor's dates → cheapest 6 with a total price and a link
async function bookingSearch(env, geo, p) {
  const r = await fetch(`${bookingBase(env)}/accommodations/search`, { method: 'POST', headers: bookingHeaders(env), body: JSON.stringify({
    booker: { country: 'gb', platform: 'desktop' },
    checkin: p.checkin, checkout: p.checkout,
    coordinates: { latitude: geo.lat, longitude: geo.lon, radius: 5 },
    guests: { number_of_adults: p.adults, number_of_rooms: p.rooms },
    currency: 'GBP', rows: 30,
  }) });
  if (!r.ok) throw new Error(`Booking search ${r.status}`);
  const { data = [] } = await r.json();
  return data.map(x => ({ id: x.id, price: Number(x.price?.total ?? x.price?.book), currency: x.currency?.booker || 'GBP', url: x.deep_link_url || x.url }))
    .filter(x => x.id && x.price > 0 && x.url).sort((a, b) => a.price - b.price).slice(0, 6);
}

// Names, stars, address and a photo for those properties
async function bookingDetails(env, ids) {
  const r = await fetch(`${bookingBase(env)}/accommodations/details`, { method: 'POST', headers: bookingHeaders(env), body: JSON.stringify({
    accommodations: ids, extras: ['photos'], languages: ['en-gb'],
  }) });
  if (!r.ok) throw new Error(`Booking details ${r.status}`);
  const { data = [] } = await r.json();
  const out = {};
  for (const x of data) {
    const name = typeof x.name === 'string' ? x.name : x.name?.['en-gb'];
    if (!name) continue;
    const photo = x.photos?.[0]?.url?.large || x.photos?.[0]?.url?.standard;
    const stars = Number(x.rating?.stars);
    out[x.id] = { name, ...(stars >= 1 && stars <= 5 ? { stars } : {}),
      ...(x.location?.address?.['en-gb'] ? { area: x.location.address['en-gb'] } : {}),
      ...(photo ? { photo: { src: photo, credit: 'Booking.com' } } : {}) };
  }
  return out;
}

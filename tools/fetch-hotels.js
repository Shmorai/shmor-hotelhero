/* HotelHero: fetch REAL hotels for UK destinations (free, OpenStreetMap + Wikidata) and save them
   to assets/hotels.json, which /compare/ uses for its "Top hotels" cards. Places not in the file are
   looked up live in the visitor's browser by assets/site.js (same Nominatim search), so this file
   just makes the popular ones instant and gives them photos.

     node tools/fetch-hotels.js            every destination used in content/ plus EXTRA towns below
     node tools/fetch-hotels.js York Bath  only these

   Data: hotel names, stars and street from OpenStreetMap's Nominatim search (© OpenStreetMap
   contributors, ODbL), photos from Wikidata/Wikimedia Commons when the hotel has one. No prices: those
   are only ever shown by the booking sites themselves. Re-run every month or two so closed/renamed
   hotels drop out. Nominatim's usage policy allows max 1 request a second, so this runs slowly. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'hotels.json');
const UA = { 'User-Agent': 'HotelHero/1.0 (https://hotelhero.shmor.ai; wirelesspaisa@gmail.com)' };
const PER_PLACE = 6;
const EXTRA = ['Leicester', 'Nottingham', 'Leeds', 'Sheffield', 'Bradford', 'Hull', 'Sunderland', 'Durham', 'Harrogate', 'Scarborough',
  'Blackpool', 'Chester', 'Lancaster', 'Preston', 'Stoke-on-Trent', 'Derby', 'Coventry', 'Wolverhampton', 'Worcester', 'Cheltenham',
  'Gloucester', 'Exeter', 'Plymouth', 'Torquay', 'Bournemouth', 'Southampton', 'Portsmouth', 'Winchester', 'Salisbury', 'Reading',
  'Milton Keynes', 'Norwich', 'Ipswich', 'Colchester', 'Southend-on-Sea', 'Margate', 'Dover', 'Eastbourne', 'Hastings', 'Chichester',
  'Lincoln', 'Peterborough', 'Northampton', 'Luton', 'Watford', 'St Albans', 'Swansea', 'Newport', 'Llandudno', 'Tenby',
  'Aberdeen', 'Dundee', 'Inverness', 'Stirling', 'St Andrews', 'Fort William', 'Perth', 'Londonderry', 'Portrush', 'Keswick',
  'Windermere', 'Ambleside', 'Newquay', 'Falmouth', 'Penzance', 'Weymouth', 'Gatwick Airport', 'Heathrow Airport', 'Manchester Airport', 'Stansted Airport'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = q => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Destinations: every "q" in content (deal cards) plus each city page's own name, plus EXTRA
function destinations() {
  const set = new Map();
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(ROOT, 'content'))) {
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const b of p.blocks || []) for (const it of b.items || []) if (b.type === 'hotels' && it.q) set.set(key(it.q), it.q);
    const m = /value="([^"]+)"/.exec(p.heroHtml || '');
    if (m) set.set(key(m[1]), m[1]);
  }
  for (const q of EXTRA) set.set(key(q), q);
  // Theme searches like "Bath spa hotel" reuse the place's hotels
  return [...set.values()].filter(q => !/\b(spa|family|dog friendly|hotel)\b/i.test(q) && q !== 'United Kingdom');
}

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(2000 * 2 ** i);
  }
  throw new Error('gave up: ' + url);
}

async function photo(qid) {
  try {
    const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P18&format=json`, 2);
    const file = j.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file) return null;
    const f = encodeURIComponent(file.replace(/ /g, '_'));
    return { src: `https://commons.wikimedia.org/wiki/Special:FilePath/${f}?width=640`, page: `https://commons.wikimedia.org/wiki/File:${f}` };
  } catch (e) { return null; }
}

// Same search and ranking as the live lookup in assets/site.js
async function hotelsFor(q) {
  const rows = await getJSON(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent('hotels in ' + q)}&countrycodes=gb&format=jsonv2&limit=30&extratags=1&addressdetails=1`);
  await sleep(1100);
  const seen = new Set();
  const list = rows.filter(x => x.type === 'hotel' && x.name && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase())).map(x => {
    const t = x.extratags || {}, a = x.address || {}, st = parseFloat(t.stars);
    return { name: x.name, ...(st >= 1 && st <= 5 ? { stars: st } : {}), ...(a.road || a.suburb ? { area: a.road || a.suburb } : {}), wd: t.wikidata,
      s: (st || 0) * 10 + (t.wikidata ? 6 : 0) + (x.name.split(' ').length > 1 ? 2 : 0) + (t.website ? 1 : 0) };
  }).sort((a, b) => b.s - a.s).slice(0, PER_PLACE);
  for (const h of list) {
    if (h.wd) { const p = await photo(h.wd); if (p) h.photo = p; await sleep(250); }
    delete h.wd; delete h.s;
  }
  return list;
}

(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : destinations();
  const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { places: {} };
  const save = () => {
    data.updated = new Date().toISOString().slice(0, 10);
    data.source = 'OpenStreetMap contributors (ODbL) and Wikidata/Wikimedia Commons';
    fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  };
  let n = 0;
  for (const q of want) {
    try {
      const list = await hotelsFor(q);
      if (list.length >= 3) { data.places[key(q)] = { q, hotels: list }; console.log(`✓ ${q}: ${list.map(h => h.name).join(' · ')}`); }
      else console.log(`! ${q}: only ${list.length} hotels found, skipped (live lookup will still try)`);
    } catch (e) { console.log(`✗ ${q}: ${e.message} (kept previous data)`); }
    if (++n % 10 === 0) save(); // keep progress if interrupted
  }
  save();
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(data.places).length} places`);
})();

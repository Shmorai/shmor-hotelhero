# HotelHero live prices (switched off)

The site's "Top hotels" cards can show **real** prices for the visitor's dates. They stay switched off until a booking site gives HotelHero access to its price feed. Until then, every card shows "Live price ↗" buttons and nothing changes for visitors.

## How it fits together
1. `/compare/?q=York&in=…` asks this Worker for `/prices?q=York&in=…&out=…&adults=…&rooms=…`.
2. The Worker calls the **Booking.com Demand API** (secret key kept here, never in the website) and returns the cheapest 6 hotels near the place, each with its real total price and a Booking.com link.
3. The page shows them: price, a "From £…" badge, a "Best price" tag, "View deal ↗". The other sites keep their "Live price ↗" buttons.
4. If the Worker is off, slow (over 8 s) or returns nothing, the page falls back to the normal OpenStreetMap hotel cards.

## Switching it on (after Booking.com approves Demand API access)
1. Free Cloudflare account → `npx wrangler login` (run in this folder).
2. `npx wrangler secret put BOOKING_AFFILIATE_ID` and `npx wrangler secret put BOOKING_TOKEN` (from Booking.com Partner Centre).
3. Test with the sandbox first: uncomment `BOOKING_BASE` in `wrangler.toml`, then `npx wrangler dev` and open `http://localhost:8787/prices?q=York&in=YYYY-MM-DD&out=YYYY-MM-DD&adults=2&rooms=1`. **The request and response field names in `src/index.js` were written from the public docs and have not been tested against the real API yet**: check them against https://developers.booking.com/demand/docs.
4. `npx wrangler deploy`, then put the Worker URL in `../shmor-site.json` → `"priceApi": "https://hotelhero-prices.<your-subdomain>.workers.dev"`, run `node tools/build.js`, and commit.
5. Read Booking.com's display rules (price must match the API: totals, taxes and currency) before launch.

## Rules
- Prices only ever come from a partner API response for the exact search. Never type in or invent prices.
- Expedia / Hotels.com: their price API (Rapid) is for partners who take bookings on their own site, not for click-out affiliates, so it isn't wired in. Their buttons stay as deep links (with your affiliate tag once you join their programme).

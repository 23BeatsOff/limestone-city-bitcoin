# Stock-price proxy (Cloudflare Worker) — optional

**You do not need this.** By default the "True Return" section reaches Yahoo
Finance through public CORS gateways (see `GATEWAYS` in `js/truereturn.js`),
which needs no setup. This Worker is an optional upgrade if those gateways
ever prove unreliable: it is under your control, caches at the edge, and only
answers for this site.

The site is static and Yahoo Finance sends no CORS header, so the browser
cannot call it directly. `stock-proxy.js` is a tiny Cloudflare Worker that
fetches Yahoo on the server side, adds CORS, and caches each answer at the
edge for 15 minutes.

Free tier is 100,000 requests/day. No API key is needed.

## Deploy (dashboard, ~2 minutes, no tooling required)

1. Sign in at <https://dash.cloudflare.com> (create a free account if needed).
2. Left sidebar: **Workers & Pages** → **Create** → **Create Worker**.
3. Name it `cdc-stock-proxy` and click **Deploy** (this deploys the hello-world
   starter; you replace it next).
4. Click **Edit code**, select everything in the editor, delete it, and paste
   the full contents of `worker/stock-proxy.js`. Click **Deploy**.
5. Copy the Worker URL shown on its page. It looks like
   `https://cdc-stock-proxy.<your-subdomain>.workers.dev`.

Sanity check in a browser tab:

    https://cdc-stock-proxy.<your-subdomain>.workers.dev/?symbol=SHOP.TO&range=1y

You should get JSON with a `points` array.

## Wire it into the site

Open `js/truereturn.js` and set `PROXY_DEFAULT` to the Worker URL (no trailing
slash). Commit and push; GitHub Pages redeploys.

## Notes

- CORS is restricted to `limestonecitybitcoin.com` (and any `localhost` for
  development). Add other origins to `ALLOWED_ORIGINS` if the site moves.
- Symbols are validated (`A-Z 0-9 . - = ^`, max 15 chars) and only the five
  ranges the UI uses are accepted, so the Worker cannot be used as an open
  proxy.
- Prices are the adjusted close (split + dividend adjusted), i.e. a
  total-return series, which is the honest basis for "what did this actually
  return."
- Optional later: attach a custom route such as `api.limestonecitybitcoin.com`
  in the Worker's **Settings → Domains & Routes**.

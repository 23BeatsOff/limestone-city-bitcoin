// =============================================================================
//  stock-proxy.js — Cloudflare Worker
// =============================================================================
//  The site is static, and Yahoo Finance sends no CORS header, so the browser
//  can't call it directly. This Worker fetches the Yahoo chart endpoint on the
//  server side, trims it to the fields the site needs, adds CORS, and caches
//  each answer at the edge for 15 minutes.
//
//  Request:   GET /?symbol=SHOP.TO&range=1y
//             range ∈ 3mo | 6mo | ytd | 1y | 5y
//  Response:  { symbol, name, currency, exchange, range, interval, points,
//               fetchedAt }   where points = [{ d: "YYYY-MM-DD", c: 123.45 }]
//             `c` is the ADJUSTED close (split + dividend adjusted), i.e. a
//             total-return series. Falls back to raw close when Yahoo has none.
//  Errors:    { error: "bad_symbol" | "bad_range" | "not_found" | "upstream" }
// =============================================================================

const ALLOWED_ORIGINS = new Set([
  "https://limestonecitybitcoin.com",
  "https://www.limestonecitybitcoin.com",
  "https://23beatsoff.github.io",
]);
const RANGES = new Set(["3mo", "6mo", "ytd", "1y", "5y"]);
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;
const CACHE_SECONDS = 900;

function corsHeaders(origin) {
  // Allow the production site plus any localhost for local development.
  const ok =
    ALLOWED_ORIGINS.has(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://limestonecitybitcoin.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") return json({ error: "method" }, 405, origin);

    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    const range = (url.searchParams.get("range") || "1y").toLowerCase();
    if (!SYMBOL_RE.test(symbol)) return json({ error: "bad_symbol" }, 400, origin);
    if (!RANGES.has(range)) return json({ error: "bad_range" }, 400, origin);

    // Edge cache keyed on the normalised query only (never on the caller).
    const cacheKey = new Request(
      `https://cache.local/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`
    );
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, {
        status: hit.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Cache": "HIT",
          ...corsHeaders(origin),
        },
      });
    }

    const upstream =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${range}&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;

    let res;
    try {
      res = await fetch(upstream, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; limestonecitybitcoin.com stock-proxy)",
          Accept: "application/json",
        },
      });
    } catch {
      return json({ error: "upstream" }, 502, origin);
    }
    if (res.status === 404) return json({ error: "not_found", symbol }, 404, origin);
    if (!res.ok) return json({ error: "upstream", status: res.status }, 502, origin);

    let data;
    try {
      data = await res.json();
    } catch {
      return json({ error: "upstream" }, 502, origin);
    }
    const result = data?.chart?.result?.[0];
    if (!result || !Array.isArray(result.timestamp)) {
      return json({ error: "not_found", symbol }, 404, origin);
    }

    const meta = result.meta || {};
    const ts = result.timestamp;
    const close = result.indicators?.quote?.[0]?.close || [];
    const adj = result.indicators?.adjclose?.[0]?.adjclose || [];
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const c = adj[i] ?? close[i];
      if (c == null || !isFinite(c)) continue;
      points.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c });
    }
    if (points.length < 2) return json({ error: "not_found", symbol }, 404, origin);

    const body = {
      symbol: meta.symbol || symbol,
      name: meta.longName || meta.shortName || meta.symbol || symbol,
      currency: meta.currency || null,
      exchange: meta.exchangeName || null,
      // Lets the site tell a young CDR apart from a genuine cross-listing.
      firstTradeDate: meta.firstTradeDate
        ? new Date(meta.firstTradeDate * 1000).toISOString().slice(0, 10)
        : null,
      range,
      interval: "1d",
      points,
      fetchedAt: new Date().toISOString(),
    };

    const out = json(body, 200, origin, {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      "X-Cache": "MISS",
    });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  },
};

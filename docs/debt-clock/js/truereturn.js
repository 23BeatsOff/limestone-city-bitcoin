// =============================================================================
//  truereturn.js — "The True Return"
// =============================================================================
//  A stock, measured against the loonies printed while you held it.
//
//  Nominal is what Google Finance and Wealthsimple show. We first convert to
//  CAD (Bank of Canada daily USD/CAD) so a US stock is a real Canadian-investor
//  return, then deflate it two ways, both from the Bank of Canada Valet API:
//
//    • CPI  V41690973  Total CPI index          → the "official" real return
//    • M2   V41552796  M2 (gross, SA)           → return vs. money-supply growth
//
//  Prices are adjusted closes (split + dividend adjusted), i.e. total return.
//  Monthly BoC series are linearly interpolated to trading days and held flat
//  past their latest print; the UI states the "through" month so the lag is
//  never hidden.
//
//  Stock history: a GitHub Action (.github/workflows/prices.yml) pulls five
//  years of daily prices from Yahoo Finance every night for the ticker
//  universe and publishes one JSON file per symbol on the repo's `data`
//  branch, which GitHub serves with CORS. The browser fetches a single file
//  per symbol and slices 3M/6M/YTD/1Y/5Y locally, so range switches are
//  instant and nothing depends on a third party at runtime. Optionally a
//  deployed worker/stock-proxy.js can serve live data instead (PROXY_DEFAULT).
// =============================================================================

// Optional Worker URL (no trailing slash); empty = read the nightly data.
// `?stockproxy=` overrides it, which is handy for local testing.
const PROXY_DEFAULT = "";
const STOCK_PROXY =
  new URLSearchParams(location.search).get("stockproxy") || PROXY_DEFAULT;
// `?stockdata=` points at a local copy of the nightly files for testing.
const DATA_BASE =
  new URLSearchParams(location.search).get("stockdata") ||
  "https://raw.githubusercontent.com/23BeatsOff/limestone-city-bitcoin/data/prices";
const stockCache = new Map(); // symbol → full 5y series (or null when unknown)

const BOC = "https://www.bankofcanada.ca/valet/observations";
const SERIES = { m2: "V41552796", cpi: "V41690973", fx: "FXUSDCAD" };
const BOC_CACHE_KEY = "cdc.boc.v1";
const BOC_CACHE_TTL = 12 * 3600 * 1000;

export const RANGES = [
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "ytd", label: "YTD" },
  { id: "1y", label: "1Y" },
  { id: "5y", label: "5Y" },
];

const COLORS = { nom: "#8E897F", real: "#44626C", m2adj: "#A23A2A", inbtc: "#C7A04C" };
const KEYS = ["nom", "real", "m2adj", "inbtc"];
const WIDTHS = { nom: 1.8, real: 2, m2adj: 2.6, inbtc: 2.2 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const iso = (d) => d.toISOString().slice(0, 10);
const fmtMonth = (t) => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const fmtDay = (t) => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const pct = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const last = (a) => a[a.length - 1];

// ---------- Bank of Canada ----------
let bocPromise = null;

function loadBoC() {
  if (bocPromise) return bocPromise;
  bocPromise = (async () => {
    try {
      const c = JSON.parse(localStorage.getItem(BOC_CACHE_KEY));
      if (c && Date.now() - c.at < BOC_CACHE_TTL) return c.data;
    } catch { /* no cache */ }

    const start = new Date();
    start.setUTCFullYear(start.getUTCFullYear() - 6);
    const url = `${BOC}/${SERIES.m2},${SERIES.cpi},${SERIES.fx}/json?start_date=${iso(start)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`BoC ${r.status}`);
    const j = await r.json();

    const out = { m2: [], cpi: [], fx: [] };
    for (const o of j.observations || []) {
      const t = Date.parse(`${o.d}T00:00:00Z`);
      for (const k of Object.keys(SERIES)) {
        const cell = o[SERIES[k]];
        if (cell && cell.v != null && cell.v !== "") out[k].push({ t, v: Number(cell.v) });
      }
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
    if (!out.m2.length || !out.cpi.length || !out.fx.length) throw new Error("BoC: empty series");

    try { localStorage.setItem(BOC_CACHE_KEY, JSON.stringify({ at: Date.now(), data: out })); } catch { /* quota */ }
    return out;
  })();
  bocPromise.catch(() => { bocPromise = null; });
  return bocPromise;
}

// Linear interpolation between observations; flat before the first and after
// the last (the last-print hold is what makes the lag honest, not hidden).
function valueAt(series, t) {
  if (t <= series[0].t) return series[0].v;
  const end = last(series);
  if (t >= end.t) return end.v;
  let lo = 0, hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = series[lo], b = series[hi];
  return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
}

// ---------- Stock history ----------
// Trim Yahoo's chart payload to what the site needs. Mirrors the Worker.
function normalizeYahoo(data, sym) {
  const result = data?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) return null;
  const meta = result.meta || {};
  const close = result.indicators?.quote?.[0]?.close || [];
  const adj = result.indicators?.adjclose?.[0]?.adjclose || [];
  const points = [];
  result.timestamp.forEach((t, i) => {
    const c = adj[i] ?? close[i];
    if (c != null && isFinite(c)) points.push({ d: new Date(t * 1000).toISOString().slice(0, 10), c });
  });
  if (points.length < 2) return null;
  const day = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : null);
  return {
    symbol: meta.symbol || sym,
    name: meta.longName || meta.shortName || meta.symbol || sym,
    currency: meta.currency || null,
    exchange: meta.exchangeName || null,
    firstTradeDate: day(meta.firstTradeDate),
    points,
  };
}

// Resolves to the full five-year series, or null when the symbol is unknown.
// Throws only when the data source itself is unreachable.
async function fetchOne(sym) {
  if (stockCache.has(sym)) return stockCache.get(sym);
  const url = STOCK_PROXY
    ? `${STOCK_PROXY}/?symbol=${encodeURIComponent(sym)}&range=5y`
    : `${DATA_BASE}/${encodeURIComponent(sym)}.json`;
  const r = await fetch(url);
  let out;
  if (r.status === 404) out = null;
  else if (!r.ok) throw new Error(`source ${r.status}`);
  else {
    const j = await r.json();
    out = Array.isArray(j.points) && j.points.length > 1 ? j : null;
  }
  stockCache.set(sym, out);
  return out;
}

// Cut the five-year series down to the selected range, anchored on the last
// trading day so "1Y" means the same window Yahoo itself would return.
function sliceRange(stock, range) {
  const pts = stock.points;
  const end = new Date(`${pts[pts.length - 1].d}T00:00:00Z`);
  let start;
  if (range === "ytd") start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  else {
    start = new Date(end);
    const months = { "3mo": 3, "6mo": 6, "1y": 12, "5y": 60 }[range] ?? 12;
    start.setUTCMonth(start.getUTCMonth() - months);
  }
  const from = start.toISOString().slice(0, 10);
  let i = pts.findIndex((p) => p.d >= from);
  if (i < 0) i = 0;
  if (i > pts.length - 2) i = Math.max(0, pts.length - 2);
  // `truncated`: the listing itself is younger than the range asked for,
  // judged by its first trade date, not by where our five-year file starts.
  const listed = stock.firstTradeDate || pts[0].d;
  return { ...stock, points: pts.slice(i), truncated: i === 0 && listed > from };
}

const EXCHANGES = {
  TOR: "TSX", VAN: "TSXV", CNQ: "CSE", NEO: "Cboe CA",
  NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ", NYQ: "NYSE", ASE: "NYSE American", PCX: "NYSE Arca",
};
export const exchangeName = (code) => EXCHANGES[code] || code || "";

// "Apple Inc." vs "Apple Inc. CDR (CAD Hedged)" should read as the same company.
const NAME_NOISE = new Set([
  "inc", "incorporated", "corp", "corporation", "ltd", "limited", "plc", "co", "company", "the",
  "cdr", "cad", "hedged", "class", "a", "b", "common", "shares", "stock", "holdings", "group",
]);
function normName(n = "") {
  return n.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w && !NAME_NOISE.has(w)).join(" ");
}
function sameCompany(a, b) {
  const x = normName(a.name), y = normName(b.name);
  if (!x || !y) return false;
  return x === y || x.split(" ")[0] === y.split(" ")[0];
}
// A Canadian Depositary Receipt: same company, but a CAD-hedged wrapper that
// only started trading in the CDR era, long after the primary listing.
function looksLikeCDR(ca, us) {
  const t = Date.parse(ca.firstTradeDate || ""), u = Date.parse(us.firstTradeDate || "");
  return isFinite(t) && isFinite(u) && t >= Date.parse("2021-01-01") && t - u > 2 * 365 * 864e5;
}

// Never guess silently. A bare symbol checks both the TSX and US listings:
//   only one exists          → use it
//   both, same company       → the primary market (US for a CDR, TSX for a
//                              genuine cross-listing), with a flip link
//   both, different company  → ask (T is Telus on the TSX and AT&T in the US)
// Plain-English names for the one asset the whole site is about.
const ALIASES = {
  BTC: "BTC-CAD", BITCOIN: "BTC-CAD", XBT: "BTC-CAD", "₿": "BTC-CAD", BTCCAD: "BTC-CAD", BTCUSD: "BTC-USD",
};

async function resolveStock(symbolRaw) {
  let s = symbolRaw.trim().toUpperCase().replace(/\s+/g, "");
  s = ALIASES[s] || s;
  if (/[.=^-]/.test(s) && !/^[A-Z0-9]+-[A-Z]$/.test(s)) {
    // Explicit listing (SHOP.TO, BTC-CAD, GC=F). A "BRK-B" style share class
    // is still ambiguous between markets, so it falls through to the probe.
    const j = await fetchOne(s);
    if (!j) { const e = new Error("not_found"); e.tried = [s]; throw e; }
    return { stock: j, alt: null };
  }
  const [ca, us] = await Promise.all([fetchOne(`${s}.TO`), fetchOne(s)]);
  if (!ca && !us) { const e = new Error("not_found"); e.tried = [`${s}.TO`, s]; throw e; }
  if (!us) return { stock: ca, alt: null };
  if (!ca) return { stock: us, alt: null };
  if (sameCompany(ca, us)) {
    return looksLikeCDR(ca, us) ? { stock: us, alt: ca } : { stock: ca, alt: us };
  }
  const e = new Error("ambiguous");
  e.options = [ca, us];
  throw e;
}

// ---------- Bitcoin ----------
// BTC-CAD comes from the same nightly publish as the stocks (daily closes,
// seven days a week). Null if unavailable, so the rest of the chart still works.
async function loadBTC() {
  try {
    const j = await fetchOne("BTC-CAD");
    if (!j) return null;
    return j.points.map((p) => ({ t: Date.parse(`${p.d}T00:00:00Z`), v: p.c }));
  } catch {
    return null;
  }
}

// ---------- The arithmetic ----------
function compute(stock, boc, btc) {
  const usd = stock.currency === "USD";
  const isBtc = /^BTC-/.test(stock.symbol);
  const useBtc = !!btc && !isBtc; // pricing bitcoin in bitcoin is a flat line
  const rows = stock.points.map((p) => {
    const t = Date.parse(`${p.d}T00:00:00Z`);
    const r = { t, cad: p.c * (usd ? valueAt(boc.fx, t) : 1), m2: valueAt(boc.m2, t), cpi: valueAt(boc.cpi, t) };
    if (useBtc) r.btc = valueAt(btc, t);
    return r;
  });
  const b = rows[0];
  for (const r of rows) {
    r.nom = (100 * r.cad) / b.cad;      // indexed to 100 at the start of the range
    r.real = (r.nom * b.cpi) / r.cpi;   // in start-of-range purchasing power
    r.m2adj = (r.nom * b.m2) / r.m2;    // as a constant share of the money supply
    if (useBtc) r.inbtc = (r.nom * b.btc) / r.btc; // priced in bitcoin
  }
  const e = last(rows);
  return {
    rows,
    keys: KEYS.filter((k) => e[k] != null),
    ret: { nom: e.nom - 100, real: e.real - 100, m2adj: e.m2adj - 100, inbtc: useBtc ? e.inbtc - 100 : null },
    growth: {
      m2: (e.m2 / b.m2 - 1) * 100,
      cpi: (e.cpi / b.cpi - 1) * 100,
      btc: useBtc ? (e.btc / b.btc - 1) * 100 : null,
    },
    through: { m2: last(boc.m2).t, cpi: last(boc.cpi).t, fx: last(boc.fx).t },
    usd,
    isBtc,
    useBtc,
    truncated: !!stock.truncated,
  };
}

// ---------- Chart ----------
function drawChart(canvas, rows, hoverIdx) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return null;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const keys = KEYS.filter((k) => rows[0][k] != null);
  const padL = 44, padR = 14, padT = 14, padB = 26;
  const x0 = rows[0].t, x1 = last(rows).t;
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) for (const k of keys) { lo = Math.min(lo, r[k]); hi = Math.max(hi, r[k]); }
  const padY = (hi - lo) * 0.08 || 5;
  lo -= padY; hi += padY;
  const X = (t) => padL + ((t - x0) / (x1 - x0 || 1)) * (W - padL - padR);
  const Y = (v) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);

  // Gridlines + y labels
  ctx.font = '11px "Courier New", Courier, monospace';
  ctx.lineWidth = 1;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks;
    const y = Y(v);
    ctx.strokeStyle = "rgba(43,42,39,0.10)";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = "#5E5B55"; ctx.textAlign = "right";
    ctx.fillText(v.toFixed(0), padL - 6, y + 4);
  }
  // The 100 line = where you started
  if (lo < 100 && hi > 100) {
    ctx.strokeStyle = "rgba(43,42,39,0.4)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(W - padR, Y(100)); ctx.stroke();
    ctx.setLineDash([]);
  }
  // x labels
  ctx.fillStyle = "#5E5B55"; ctx.textAlign = "center";
  for (const f of [0, 0.5, 1]) {
    const t = x0 + (x1 - x0) * f;
    ctx.textAlign = f === 0 ? "left" : f === 1 ? "right" : "center";
    ctx.fillText(fmtDay(t), f === 0 ? padL : f === 1 ? W - padR : X(t), H - 8);
  }

  // Lines
  const line = (k, color, w) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    rows.forEach((r, i) => { const x = X(r.t), y = Y(r[k]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  };
  for (const k of keys) line(k, COLORS[k], WIDTHS[k]);

  // Hover crosshair
  if (hoverIdx != null && rows[hoverIdx]) {
    const r = rows[hoverIdx], x = X(r.t);
    ctx.strokeStyle = "rgba(43,42,39,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    for (const k of keys) {
      ctx.fillStyle = COLORS[k];
      ctx.beginPath(); ctx.arc(x, Y(r[k]), 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ECE8E0"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  return { X, padL, padR, W };
}

function nearestIndex(rows, t) {
  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid].t <= t) lo = mid; else hi = mid; }
  return t - rows[lo].t < rows[hi].t - t ? lo : hi;
}

// ---------- UI ----------
export function initTrueReturn(root) {
  if (!root) return;
  const form = root.querySelector("#tr-form");
  const input = root.querySelector("#tr-ticker");
  const rangeBar = root.querySelector("#tr-ranges");
  const summary = root.querySelector("#tr-summary");
  const chartWrap = root.querySelector("#tr-chart-wrap");
  const canvas = root.querySelector("#tr-chart");
  const tip = root.querySelector("#tr-tip");
  const note = root.querySelector("#tr-note");
  const status = root.querySelector("#tr-status");
  const title = root.querySelector("#tr-title");

  const state = { symbol: null, range: "1y", result: null, hover: null, busy: false };

  // Range buttons
  rangeBar.innerHTML = RANGES.map(
    (r) => `<button type="button" class="tr-range${r.id === state.range ? " on" : ""}" data-range="${r.id}">${r.label}</button>`
  ).join("");
  rangeBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]");
    if (!b || state.busy) return;
    state.range = b.dataset.range;
    for (const el of rangeBar.querySelectorAll(".tr-range")) el.classList.toggle("on", el === b);
    // The full series is already here; a new range is just a re-slice.
    if (state.result && state.boc) {
      state.hover = null;
      tip.hidden = true;
      state.result.calc = compute(sliceRange(state.result.stock, state.range), state.boc, state.btc);
      render();
    } else if (state.symbol) run();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    state.symbol = v;
    run();
  });

  function setStatus(msg, kind = "", html = false) {
    if (html) status.innerHTML = msg || ""; else status.textContent = msg || "";
    status.className = `tr-status ${kind}`;
    status.hidden = !msg;
  }
  const listing = (o) => `${o.symbol} · ${o.name} (${exchangeName(o.exchange)}, ${o.currency})`;

  // Chooser buttons and the "also listed as" flip link both re-run with an
  // explicit symbol, which skips the guessing entirely.
  root.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-sym]");
    if (!pick || state.busy) return;
    e.preventDefault();
    input.value = pick.dataset.sym;
    state.symbol = pick.dataset.sym;
    run();
  });

  function render() {
    const { result } = state;
    if (!result) return;
    const { stock, alt, calc } = result;
    const sign = (n) => (n >= 0 ? "pos" : "neg");
    const win0 = calc.rows[0].t, win1 = last(calc.rows).t;
    // A deflator held flat across the whole window says nothing about it.
    const noCpi = win0 >= calc.through.cpi;
    const noM2 = win0 >= calc.through.m2;

    title.innerHTML =
      `<span class="tr-sym">${stock.symbol}</span> ` +
      `<span class="tr-name">${stock.name}</span> ` +
      `<span class="tr-ex">${exchangeName(stock.exchange)} · ${stock.currency}${calc.usd ? " → CAD" : ""}</span>` +
      (alt
        ? ` <a href="#true-return" class="tr-alt" data-sym="${alt.symbol}">Also listed as ${alt.symbol} (${exchangeName(alt.exchange)}, ${alt.currency}). Chart that instead</a>`
        : "");

    summary.innerHTML = `
      <div class="tr-stat">
        <span class="tr-k">Nominal <em>(CAD)</em></span>
        <span class="tr-v ${sign(calc.ret.nom)}">${pct(calc.ret.nom)}</span>
        <span class="tr-s">What Google shows you</span>
      </div>
      <div class="tr-stat real">
        <span class="tr-k">After CPI</span>
        <span class="tr-v ${sign(calc.ret.real)}">${pct(calc.ret.real)}</span>
        <span class="tr-s">${noCpi
          ? `No CPI print inside this window yet (latest: ${fmtMonth(calc.through.cpi)})`
          : `Prices rose ${calc.growth.cpi.toFixed(1)}% (official)`}</span>
      </div>
      <div class="tr-stat m2">
        <span class="tr-k">After M2 growth</span>
        <span class="tr-v ${sign(calc.ret.m2adj)}">${pct(calc.ret.m2adj)}</span>
        <span class="tr-s">${noM2
          ? `No M2 print inside this window yet (latest: ${fmtMonth(calc.through.m2)})`
          : `Money supply grew ${calc.growth.m2.toFixed(1)}%`}</span>
      </div>` +
      (calc.useBtc
        ? `
      <div class="tr-stat btc">
        <span class="tr-k">In Bitcoin</span>
        <span class="tr-v ${sign(calc.ret.inbtc)}">${pct(calc.ret.inbtc)}</span>
        <span class="tr-s">Bitcoin ${calc.growth.btc >= 0 ? "rose" : "fell"} ${Math.abs(calc.growth.btc).toFixed(1)}% in CAD</span>
      </div>`
        : "");

    const gap = calc.ret.nom - calc.ret.m2adj;
    const verdict =
      calc.ret.m2adj >= 0
        ? `it still beat the printer, by <strong>${calc.ret.m2adj.toFixed(1)}%</strong>`
        : `you actually <strong>lost ${Math.abs(calc.ret.m2adj).toFixed(1)}%</strong> of your share of all the money`;
    const btcLine = calc.useBtc
      ? ` Priced in bitcoin, the hardest money there is, the same position ` +
        (calc.ret.inbtc >= 0
          ? `<strong class="btc">gained ${calc.ret.inbtc.toFixed(1)}%</strong>.`
          : `<strong class="btc">lost ${Math.abs(calc.ret.inbtc).toFixed(1)}%</strong>.`)
      : "";
    const punch = noM2
      ? `<p class="tr-punch">The screen says <strong>${pct(calc.ret.nom)}</strong>. The Bank of Canada hasn't published M2 ` +
        `for any month inside this window yet (latest print: <strong>${fmtMonth(calc.through.m2)}</strong>), so the M2 line ` +
        `can't move. Pick a longer range, or check back after the next release.${btcLine}</p>`
      : `<p class="tr-punch">The screen says <strong>${pct(calc.ret.nom)}</strong>. Over the same stretch the Bank of Canada ` +
        `grew M2 by <strong>${calc.growth.m2.toFixed(1)}%</strong>. Measured as a constant slice of every loonie in existence, ` +
        `${verdict}. That ${gap.toFixed(1)}-point gap is the hidden tax on this position.${btcLine}</p>`;
    note.innerHTML =
      punch +
      `<p class="tr-method">Window: <strong>${fmtDay(win0)}</strong> to <strong>${fmtDay(win1)}</strong>` +
      `${calc.truncated ? " (the listing's whole history; it is younger than the range selected)" : ""}. ` +
      `Prices from Yahoo Finance. Total return (adjusted close: splits and dividends included)` +
      `${calc.usd ? ", converted to CAD at the Bank of Canada daily USD/CAD rate" : ""}. ` +
      `CPI through <strong>${fmtMonth(calc.through.cpi)}</strong>, M2 through <strong>${fmtMonth(calc.through.m2)}</strong> ` +
      `(Bank of Canada Valet, monthly, interpolated to trading days and held flat past the latest print). ` +
      `${calc.useBtc ? "Bitcoin: BTC-CAD daily close, the CAD value of the position divided by the bitcoin price on each trading day. " : ""}` +
      `Indexed to 100 at the start of the window.</p>`;

    chartWrap.hidden = false;
    drawChart(canvas, calc.rows, state.hover);
  }

  async function run() {
    state.busy = true;
    state.hover = null;
    tip.hidden = true;
    setStatus("Pulling prices and Bank of Canada data…");
    try {
      const [{ stock, alt }, boc, btc] = await Promise.all([resolveStock(state.symbol), loadBoC(), loadBTC()]);
      state.boc = boc;
      state.btc = btc;
      state.result = { stock, alt, calc: compute(sliceRange(stock, state.range), boc, btc) };
      setStatus("");
      render();
      const q = new URLSearchParams(location.search);
      q.set("ticker", stock.symbol);
      history.replaceState(null, "", `${location.pathname}?${q}#true-return`);
    } catch (err) {
      if (err.message === "ambiguous") {
        setStatus(
          `<span>Two different companies use that symbol. Which one?</span>` +
            err.options.map((o) => `<button type="button" class="tr-pick" data-sym="${o.symbol}">${listing(o)}</button>`).join(""),
          "ask",
          true
        );
      } else if (err.message === "not_found") {
        setStatus(
          `No data for ${err.tried.join(" or ")}. We cover the S&P/TSX Composite, the S&P 500 and popular ETFs; ` +
            `try the exact symbol (SHOP.TO, AAPL), or ask us to add it.`,
          "err"
        );
      } else if (String(err.message).startsWith("BoC")) {
        setStatus("The Bank of Canada API didn't answer. Try again in a moment.", "err");
      } else {
        setStatus("Couldn't load prices right now. Try again in a moment.", "err");
      }
    } finally {
      state.busy = false;
    }
  }

  // Hover readout
  canvas.addEventListener("mousemove", (e) => {
    const res = state.result;
    if (!res) return;
    const rect = canvas.getBoundingClientRect();
    const geo = drawChart(canvas, res.calc.rows, null);
    if (!geo) return;
    const rows = res.calc.rows;
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left - geo.padL) / (geo.W - geo.padL - geo.padR)));
    const t = rows[0].t + (last(rows).t - rows[0].t) * f;
    const i = nearestIndex(rows, t);
    state.hover = i;
    drawChart(canvas, rows, i);
    const r = rows[i];
    tip.innerHTML =
      `<div class="tt-d">${fmtDay(r.t)}</div>` +
      `<div><i style="background:${COLORS.nom}"></i>Nominal <b>${r.nom.toFixed(1)}</b></div>` +
      `<div><i style="background:${COLORS.real}"></i>After CPI <b>${r.real.toFixed(1)}</b></div>` +
      `<div><i style="background:${COLORS.m2adj}"></i>After M2 <b>${r.m2adj.toFixed(1)}</b></div>` +
      (r.inbtc != null ? `<div><i style="background:${COLORS.inbtc}"></i>In Bitcoin <b>${r.inbtc.toFixed(1)}</b></div>` : "");
    tip.hidden = false;
    const x = e.clientX - rect.left;
    tip.style.left = `${Math.min(x + 14, rect.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${Math.max(4, e.clientY - rect.top - tip.offsetHeight - 12)}px`;
  });
  canvas.addEventListener("mouseleave", () => {
    tip.hidden = true;
    state.hover = null;
    if (state.result) drawChart(canvas, state.result.calc.rows, null);
  });

  // Redraw whenever the canvas gets a (new) size. This also covers the first
  // draw if the section had no layout yet when the data landed.
  let raf = 0;
  const redraw = () => {
    if (!state.result) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawChart(canvas, state.result.calc.rows, state.hover));
  };
  if ("ResizeObserver" in window) new ResizeObserver(redraw).observe(canvas);
  else window.addEventListener("resize", redraw);

  // Shareable: ?ticker=SHOP.TO pre-fills and runs.
  const pre = new URLSearchParams(location.search).get("ticker");
  if (pre) {
    input.value = pre;
    state.symbol = pre;
    run();
  }
}

// =============================================================================
//  live.js — progressive enhancement with real-time data
// =============================================================================
//  Live sources, all CORS-enabled and free:
//    - CoinGecko ...... BTC/CAD price (refreshed every 60s)
//    - StatCan WDS .... population, M2 money supply, CPI (refreshed every 6h)
//  Everything is best-effort: any failure falls back to the seed in data.js,
//  so the clock never breaks offline.
// =============================================================================

import { setOverride } from "./clock.js";

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=cad";

const STATCAN = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods";

// StatCan vectors (see js/data.js source notes):
//   1        — Canada population, quarterly
//   41552796 — M2 (gross), $ millions, monthly
//   41690973 — CPI all-items, Canada, index, monthly
const STATCAN_BODY = [
  { vectorId: 1, latestN: 5 },          // population (5 quarters → YoY rate)
  { vectorId: 41552796, latestN: 13 },  // M2 level (13 months → YoY rate)
  { vectorId: 41690973, latestN: 13 },  // CPI index (13 months → YoY %)
];

// Shared status; both sources update it, main.js renders it.
const status = { btc: false, statcan: false };
let emit = () => {};

function pushStatus() {
  const parts = [];
  if (status.statcan) parts.push("StatCan");
  if (status.btc) parts.push("CoinGecko");
  const ok = status.btc || status.statcan;
  const text = ok
    ? `● LIVE — ${parts.join(" + ")}`
    : "● SEED — offline estimates";
  emit({ ok, text });
}

async function fetchJSON(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---- BTC price (CoinGecko) -------------------------------------------------
async function refreshBTC() {
  try {
    const data = await fetchJSON(COINGECKO);
    const cad = data?.bitcoin?.cad;
    if (typeof cad !== "number" || cad <= 0) throw new Error("malformed");
    setOverride("btcPriceCAD", { value: cad });
    status.btc = true;
  } catch {
    status.btc = false;
  }
  pushStatus();
}

// ---- Macro data (StatCan WDS) ---------------------------------------------
const series = (resp, vectorId) =>
  resp.find((r) => r.object?.vectorId === vectorId)?.object?.vectorDataPoint ?? [];

async function refreshStatCan() {
  try {
    const resp = await fetchJSON(STATCAN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(STATCAN_BODY),
    });

    // --- Population (vector 1): level + live annual rate from 5 quarters ---
    const pop = series(resp, 1);
    if (pop.length) {
      const latest = pop[pop.length - 1];
      const asOfMs = Date.parse(latest.refPer);
      let perSecond;
      if (pop.length >= 5) {
        const yearAgo = pop[pop.length - 5].value; // 4 quarters back
        perSecond = (latest.value - yearAgo) / SECONDS_PER_YEAR;
      }
      setOverride("population", { value: latest.value, asOfMs, perSecond });
    }

    // --- M2 (vector 41552796, $millions): level + live YoY $ rate ---------
    const m2 = series(resp, 41552796);
    if (m2.length >= 13) {
      const latest = m2[m2.length - 1];
      const yearAgo = m2[0]; // 13 points back = 12 months
      const levelNow = latest.value * 1e6; // millions → dollars
      const levelYearAgo = yearAgo.value * 1e6;
      const asOfMs = Date.parse(latest.refPer);
      const perSecond = (levelNow - levelYearAgo) / SECONDS_PER_YEAR;
      setOverride("moneySupplyM2", { value: levelNow, asOfMs, perSecond });
      const yoyPct = (levelNow / levelYearAgo - 1) * 100;
      setOverride("m2GrowthRate", { value: yoyPct });
    }

    // --- CPI (vector 41690973): YoY % from index -------------------------
    const cpi = series(resp, 41690973);
    if (cpi.length >= 13) {
      const yoyPct = (cpi[cpi.length - 1].value / cpi[0].value - 1) * 100;
      setOverride("cpiInflation", { value: yoyPct });
    }

    status.statcan = true;
  } catch {
    status.statcan = false;
  }
  pushStatus();
}

// Kick off all live updates.
export function startLive(onStatus) {
  emit = onStatus || (() => {});
  pushStatus();
  refreshBTC();
  refreshStatCan();
  setInterval(refreshBTC, 60_000); // price moves constantly
  setInterval(refreshStatCan, 6 * 60 * 60 * 1000); // macro updates monthly/quarterly
}

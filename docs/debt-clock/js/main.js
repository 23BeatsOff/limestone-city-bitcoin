// =============================================================================
//  main.js — bind the engine to the DOM
// =============================================================================
//  Each on-screen number is an element with:
//     data-metric="federalDebt"   (which metric to read)
//     data-format="money"         (how to format it)
//  This loop formats every bound element each frame. No framework needed.
// =============================================================================

import { start, snapshot } from "./clock.js";
import { startLive } from "./live.js";
import { createOdometer } from "./odometer.js";
import { renderProvinces } from "./provinces.js";
import { initShareCard } from "./sharecard.js";
import { initOttawaCompare } from "./ottawa-compare.js";
import { initTip } from "./tip.js";
import { initTrueReturn } from "./truereturn.js";
import * as fmt from "./format.js";

const FORMATTERS = {
  money: fmt.money,
  moneyCents: fmt.moneyCents,
  count: fmt.count,
  abbrev: fmt.abbrevMoney,
  pct: fmt.pct,
  pct2: (n) => fmt.pct(n, 2),
  btc: fmt.btc,
  sats: fmt.sats,
  multiple: (n) => `${fmt.count(n)}×`,
  ppower: (n) => fmt.moneyCents(n).replace("CA", ""), // $0.71
  plain1: (n) => n.toFixed(1),
};

// Collect bound elements once. Elements with `data-odometer` get a digit-roll
// counter (driven by the raw value); the rest update their textContent.
const bound = [...document.querySelectorAll("[data-metric]")].map((el) => ({
  el,
  metric: el.dataset.metric,
  format: FORMATTERS[el.dataset.format] || fmt.count,
  odometer: "odometer" in el.dataset ? createOdometer(el) : null,
  last: null,
}));

// BTC "mined toward 21M" progress ring.
const ring = document.querySelector("#btc-ring-progress");
const RING_CIRC = ring ? 2 * Math.PI * Number(ring.getAttribute("r")) : 0;

function render(values) {
  for (const b of bound) {
    const v = values[b.metric];
    if (v === undefined) continue;
    if (b.odometer) {
      b.odometer.set(v);
      continue;
    }
    const text = b.format(v);
    if (text !== b.last) {
      b.el.textContent = text;
      b.last = text;
    }
  }

  if (ring && values.btcMinedPct !== undefined) {
    const offset = RING_CIRC * (1 - values.btcMinedPct / 100);
    ring.style.strokeDashoffset = String(offset);
  }
}

// Live data (CoinGecko + StatCan) — update the status pill.
const statusPill = document.querySelector("#live-status");
startLive((s) => {
  if (!statusPill) return;
  statusPill.textContent = s.text;
  statusPill.classList.toggle("live", s.ok);
  statusPill.classList.toggle("seed", !s.ok);
});

// Static per-province breakdown (annual figures, no ticking needed).
renderProvinces(document.querySelector("#province-bars"));

// Rotating "More than Ottawa spends on …" comparison (changes every ~2 hours).
initOttawaCompare(document.querySelector("#ottawa-compare"));

// Lightning tip — copy-address button.
initTip(document.querySelector("#tip-copy-btn"));

// "The True Return" — a stock, deflated by CPI and by M2 (Bank of Canada).
initTrueReturn(document.querySelector("#true-return"));

// Shareable "your debt in sats" card — snapshots the live values on click.
initShareCard(document.querySelector("#share-card-btn"), () => snapshot(Date.now()));

// Stamp the "data as of" line.
const asOfEl = document.querySelector("#as-of");
if (asOfEl) asOfEl.textContent = new Date().toLocaleString("en-CA");

start(render);

// Register the service worker for offline support + installability (PWA).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

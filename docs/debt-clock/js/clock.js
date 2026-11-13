// =============================================================================
//  clock.js — the deterministic extrapolation engine
// =============================================================================
//  Given the METRIC definitions, compute every metric's value at any instant.
//  Linear metrics extrapolate from an anchor; derived metrics are pure
//  functions of other live metrics. A topological pass resolves dependencies
//  each frame so "debt per citizen" tracks two independently-ticking clocks.
// =============================================================================

import { METRICS, ANCHOR_ISO } from "./data.js";

const ANCHOR_MS = new Date(ANCHOR_ISO).getTime();

// Runtime overrides from live data sources (CoinGecko, StatCan).
// Each override may carry any subset of { value, asOfMs, perSecond } and is
// merged over the seed definition. `asOfMs` lets a data point dated in the past
// (e.g. M2 as of April 1) be extrapolated forward to "now" at the live rate.
const overrides = new Map();

export function setOverride(metricId, override) {
  const prev = overrides.get(metricId) || {};
  overrides.set(metricId, { ...prev, ...override });
}

// Evaluate one linear metric at time `nowMs`.
function evalLinear(id, def, nowMs) {
  const ov = overrides.get(id) || {};
  const base = ov.value ?? def.base;
  const epochMs =
    ov.asOfMs ?? (def.epochISO ? new Date(def.epochISO).getTime() : ANCHOR_MS);
  const ps = ov.perSecond ?? def.perSecond;
  const elapsedSec = (nowMs - epochMs) / 1000;
  let val = base + ps * elapsedSec;
  if (typeof def.max === "number") val = Math.min(val, def.max);
  if (typeof def.min === "number") val = Math.max(val, def.min);
  return val;
}

// Compute ALL metrics for a given instant. Returns { id: value }.
// Derived metrics are resolved iteratively (dependencies are shallow here).
export function snapshot(nowMs = Date.now()) {
  const values = {};

  // Pass 1: linear metrics.
  for (const [id, def] of Object.entries(METRICS)) {
    if (def.kind === "linear") values[id] = evalLinear(id, def, nowMs);
  }

  // Pass 2+: derived metrics, resolved until stable (deps are 1–2 deep).
  let remaining = Object.entries(METRICS).filter(([, d]) => d.kind === "derived");
  let guard = 0;
  while (remaining.length && guard++ < 10) {
    const next = [];
    for (const [id, def] of remaining) {
      const ready = def.deps.every((dep) => dep in values);
      if (ready) values[id] = def.compute(values);
      else next.push([id, def]);
    }
    if (next.length === remaining.length) break; // no progress; avoid infinite loop
    remaining = next;
  }

  return values;
}

// Drive a render callback at the display refresh rate, with a 1s fallback so a
// backgrounded tab (where requestAnimationFrame is paused) still stays current.
export function start(onFrame) {
  let raf;
  const loop = () => {
    onFrame(snapshot(Date.now()));
    raf = requestAnimationFrame(loop);
  };
  loop();
  const fallback = setInterval(() => {
    if (document.hidden) onFrame(snapshot(Date.now()));
  }, 1000);
  return () => {
    cancelAnimationFrame(raf);
    clearInterval(fallback);
  };
}

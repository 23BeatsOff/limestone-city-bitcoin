// =============================================================================
//  data.js — THE SINGLE SOURCE OF TRUTH
// =============================================================================
//  Every number on the clock is anchored here: a known value at a known date,
//  plus a rate of change. The engine (clock.js) extrapolates between updates.
//
//  HONESTY POLICY (this is the whole point of the project):
//    - Each figure carries an `asOf` date and a `source`.
//    - Figures marked VERIFY are defensible estimates seeded for launch and
//      MUST be reconciled against the live source before you publish.
//    - Where a number can be pulled live (BTC price, USD/CAD), live.js
//      overrides the seed at runtime and falls back to the seed on failure.
//
//  PRIMARY SOURCES:
//    - Bank of Canada Valet API ........ https://www.bankofcanada.ca/valet/
//    - Statistics Canada (population) .. https://www150.statcan.gc.ca/
//    - Dept. of Finance, Fiscal Ref. Tables / Budget / Fall Econ. Statement
//    - Public Accounts of Canada (federal debt, public debt charges)
//    - Provincial public accounts (Ontario, Quebec, etc.)
//    - CoinGecko (BTC price, live) ..... https://api.coingecko.com/
// =============================================================================

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60; // 31,557,600

// Anchor moment for all seeded values. Update when you refresh the numbers.
export const ANCHOR_ISO = "2026-06-27T00:00:00Z";

// Fiscal year in Canada starts April 1.
export const FISCAL_YEAR_START_ISO = "2026-04-01T00:00:00Z";

// Bitcoin's defining property: the cap never moves.
export const BTC_HARD_CAP = 21_000_000;

// World population — for "every human's fair share of all Bitcoin, ever".
export const WORLD_POP = 8_100_000_000;

// M2 (gross) money supply in Jan 2020 — the anchor for purchasing-power decay.
// StatCan vector 41552796: $1,816,665M. Purchasing power of a 2020 dollar today
// = M2(2020) / M2(now), so it tracks the live money supply.
export const M2_2020 = 1_816_665_000_000;

// Helper: convert an annual flow ($/year) into a per-second rate.
const perSecond = (perYear) => perYear / SECONDS_PER_YEAR;

// =============================================================================
//  RAW FIGURES  (edit these; everything else is derived)
// =============================================================================
//  NOTE: all dollar figures are CANADIAN DOLLARS.
//  Values are reconciled to primary sources (2025–26). Each `base` is the
//  figure extrapolated to the ANCHOR date (2026-06-27); `asOf` names the date
//  of the underlying source observation it was projected from.

export const FIGURES = {
  // ---- Federal government -------------------------------------------------
  federalDebt: {
    // Accumulated deficit: $1,266.5B at 2025-03-31 + $78.3B FY25-26 deficit
    // ≈ $1,344.8B at 2026-04-01, then growing by the FY26-27 deficit.
    value: 1_360_500_000_000,            // ≈$1.36T at 2026-06-27
    perYear: 66_900_000_000,             // grows by the annual deficit
    asOf: "2025-03-31",
    source:
      "Annual Financial Report 2024-25 ($1,266.5B) + Budget 2025 (FY25-26 deficit $78.3B)",
  },
  federalDeficitPerYear: {
    value: 66_900_000_000,               // $66.9B (FY2026-27)
    asOf: "2026-05-01",
    source: "Spring 2026 Economic Update (deficit $66.9B); Budget 2025",
  },
  federalInterestPerYear: {
    value: 56_000_000_000,               // public debt charges, rising
    asOf: "2025-03-31",
    source: "Annual Financial Report 2024-25 — public debt charges $53.4B (rising)",
  },

  // ---- Debt interest (the visceral one) -----------------------------------
  combinedInterestPerYear: {
    value: 94_000_000_000,               // $94B/yr fed+provincial interest
    asOf: "2026-03-31",
    source: "Fraser Institute — Canadians paid ≥$94B in government debt interest, FY2025-26",
  },

  // ---- Federal + provincial (net debt) ------------------------------------
  totalGovDebt: {
    value: 2_461_000_000_000,            // ≈$2.46T at 2026-06-27
    perYear: 90_000_000_000,             // combined annual net borrowing
    asOf: "2026-03-31",
    source:
      "Fraser Institute, May 2026 — combined federal+provincial net debt $2.44T (FY2025-26)",
  },

  // ---- People -------------------------------------------------------------
  population: {
    // Declined in Q1 2026 (first drop since Confederation, NPR drawdown).
    value: 41_393_000,                   // ≈41.39M at 2026-06-27
    perYear: -100_000,                   // mild decline; revisit Sept 2026
    asOf: "2026-04-01",
    source: "Statistics Canada — Q1 2026 population estimate (41,417,056)",
  },
  taxpayers: {
    value: 29_500_000,                   // tax filers (approx)
    perYear: 100_000,
    asOf: "2024-12-31",
    source: "Canada Revenue Agency — individual tax filer statistics (approx)",
  },

  // ---- Monetary (the Austrian centerpiece) --------------------------------
  moneySupplyM2: {
    value: 2_865_000_000_000,            // ≈$2.87T at 2026-06-27
    perYear: 120_000_000_000,            // ~+4.2%/yr (offline seed; live overrides)
    asOf: "2026-04-30",
    source: "Bank of Canada / StatCan — M2 monetary aggregate ($2,816.9B, Apr 2026)",
  },
  cpiInflationRate: {
    value: 0.032,                        // 3.2% YoY (May 2026)
    asOf: "2026-05-31",
    source: "Statistics Canada — CPI, May 2026 (+3.2% YoY)",
  },
  gdp: {
    value: 3_200_000_000_000,            // ≈$3.2T at 2026-06-27
    perYear: 130_000_000_000,            // ~+4% nominal
    asOf: "2026-03-31",
    source: "Implied from Budget 2025 (deficit 2.5% of GDP) — nominal GDP ≈$3.13T FY25-26",
  },

  // ---- Bitcoin ------------------------------------------------------------
  btcMined: {
    value: 20_049_000,                   // circulating supply (block 955,702)
    perYear: 450 * 365.25,               // ~450 BTC/day @ 3.125 reward
    asOf: "2026-06-27",
    source: "mempool.space block height 955,702 + CoinGecko circulating supply",
  },
  btcPriceCAD: {
    value: 85_000,                       // seed; overridden live         // LIVE
    asOf: "2026-06-27",
    source: "CoinGecko (live) — simple/price?ids=bitcoin&vs_currencies=cad",
  },
};

// =============================================================================
//  METRIC DEFINITIONS  — what the engine ticks.
// =============================================================================
//  A metric is either:
//    { kind: "linear", base, perSecond }                  ← extrapolates in time
//    { kind: "derived", deps: [...], compute(values) }    ← function of others
//  `values` passed to compute() is a map of metricId -> current live value.
// =============================================================================

export const METRICS = {
  // --- Linear (time-extrapolated) -----------------------------------------
  federalDebt: {
    kind: "linear",
    base: FIGURES.federalDebt.value,
    perSecond: perSecond(FIGURES.federalDebt.perYear),
  },
  totalGovDebt: {
    kind: "linear",
    base: FIGURES.totalGovDebt.value,
    perSecond: perSecond(FIGURES.totalGovDebt.perYear),
  },
  federalInterest: {
    // Interest paid SINCE the start of this fiscal year (resets April 1).
    kind: "linear",
    base: 0,
    perSecond: perSecond(FIGURES.federalInterestPerYear.value),
    epochISO: FISCAL_YEAR_START_ISO,
  },
  federalDeficitYTD: {
    // Deficit accumulated since the start of this fiscal year.
    kind: "linear",
    base: 0,
    perSecond: perSecond(FIGURES.federalDeficitPerYear.value),
    epochISO: FISCAL_YEAR_START_ISO,
  },
  combinedInterestYTD: {
    // Federal + provincial debt interest paid since April 1.
    kind: "linear",
    base: 0,
    perSecond: perSecond(FIGURES.combinedInterestPerYear.value),
    epochISO: FISCAL_YEAR_START_ISO,
  },
  combinedInterestPerSecond: {
    kind: "linear",
    base: FIGURES.combinedInterestPerYear.value / (365.25 * 24 * 60 * 60),
    perSecond: 0,
  },
  population: {
    kind: "linear",
    base: FIGURES.population.value,
    perSecond: perSecond(FIGURES.population.perYear),
  },
  taxpayers: {
    kind: "linear",
    base: FIGURES.taxpayers.value,
    perSecond: perSecond(FIGURES.taxpayers.perYear),
  },
  moneySupplyM2: {
    kind: "linear",
    base: FIGURES.moneySupplyM2.value,
    perSecond: perSecond(FIGURES.moneySupplyM2.perYear),
  },
  // Live rates (percent, YoY) — base is the offline seed; live.js overrides.
  m2GrowthRate: {
    kind: "linear",
    base: 4.2, // % YoY money-supply growth (the real debasement rate)
    perSecond: 0,
  },
  cpiInflation: {
    kind: "linear",
    base: 3.2, // % YoY official CPI (what's admitted)
    perSecond: 0,
  },
  gdp: {
    kind: "linear",
    base: FIGURES.gdp.value,
    perSecond: perSecond(FIGURES.gdp.perYear),
  },
  btcMined: {
    kind: "linear",
    base: FIGURES.btcMined.value,
    perSecond: perSecond(FIGURES.btcMined.perYear),
    max: BTC_HARD_CAP, // never exceeds the cap
  },

  // --- Live / static singletons -------------------------------------------
  btcPriceCAD: {
    kind: "linear",
    base: FIGURES.btcPriceCAD.value,
    perSecond: 0, // flat unless live.js overrides
  },

  // --- Derived (the persuasive framings) ----------------------------------
  debtPerCitizen: {
    kind: "derived",
    deps: ["federalDebt", "population"],
    compute: (v) => v.federalDebt / v.population,
  },
  debtPerTaxpayer: {
    kind: "derived",
    deps: ["federalDebt", "taxpayers"],
    compute: (v) => v.federalDebt / v.taxpayers,
  },
  totalDebtPerCitizen: {
    kind: "derived",
    deps: ["totalGovDebt", "population"],
    compute: (v) => v.totalGovDebt / v.population,
  },

  // Bitcoin framings — the heart of the project.
  // The cap is FIXED at 21,000,000. That is the entire argument.
  federalDebtPerBTC: {
    kind: "derived",
    deps: ["federalDebt"],
    compute: (v) => v.federalDebt / BTC_HARD_CAP,
  },
  totalDebtPerBTC: {
    kind: "derived",
    deps: ["totalGovDebt"],
    compute: (v) => v.totalGovDebt / BTC_HARD_CAP,
  },
  yourShareInBTC: {
    // A citizen's share of the federal debt, priced in Bitcoin.
    kind: "derived",
    deps: ["debtPerCitizen", "btcPriceCAD"],
    compute: (v) => v.debtPerCitizen / v.btcPriceCAD,
  },
  yourShareInSats: {
    kind: "derived",
    deps: ["debtPerCitizen", "btcPriceCAD"],
    compute: (v) => (v.debtPerCitizen / v.btcPriceCAD) * 100_000_000,
  },
  btcRemaining: {
    kind: "derived",
    deps: ["btcMined"],
    compute: (v) => BTC_HARD_CAP - v.btcMined,
  },
  btcMinedPct: {
    kind: "derived",
    deps: ["btcMined"],
    compute: (v) => (v.btcMined / BTC_HARD_CAP) * 100,
  },

  // --- Maxi: scarcity, issuance -------------------------------------------
  // Bitcoin's annual new-supply rate — falls every halving, toward zero.
  btcIssuanceRate: {
    kind: "derived",
    deps: ["btcMined"],
    compute: (v) => ((450 * 365.25) / v.btcMined) * 100,
  },
  // "Moscow time" — sats per Canadian dollar (shrinks as BTC rises).
  satsPerCAD: {
    kind: "derived",
    deps: ["btcPriceCAD"],
    compute: (v) => 100_000_000 / v.btcPriceCAD,
  },
  // The scarcity bomb: every human's fair share of all Bitcoin, ever.
  btcPerHuman: {
    kind: "derived",
    deps: [],
    compute: () => BTC_HARD_CAP / WORLD_POP,
  },
  satsPerHuman: {
    kind: "derived",
    deps: [],
    compute: () => (BTC_HARD_CAP / WORLD_POP) * 100_000_000,
  },
  // The gut-punch: a citizen's debt-in-sats vs their fair share of all BTC.
  debtToScarcityRatio: {
    kind: "derived",
    deps: ["yourShareInSats"],
    compute: (v) => v.yourShareInSats / ((BTC_HARD_CAP / WORLD_POP) * 100_000_000),
  },

  // Debt-to-GDP (federal and total)
  federalDebtToGDP: {
    kind: "derived",
    deps: ["federalDebt", "gdp"],
    compute: (v) => (v.federalDebt / v.gdp) * 100,
  },
  totalDebtToGDP: {
    kind: "derived",
    deps: ["totalGovDebt", "gdp"],
    compute: (v) => (v.totalGovDebt / v.gdp) * 100,
  },

  // Austrian: purchasing power of a 2020 dollar = M2(2020) / M2(now).
  // Tracks the LIVE money supply, so it falls in real time as M2 expands.
  dollarPurchasingPower: {
    kind: "derived",
    deps: ["moneySupplyM2"],
    compute: (v) => M2_2020 / v.moneySupplyM2,
  },
  // New money created since 2020 — the cause of the debasement above.
  moneyPrintedSince2020: {
    kind: "derived",
    deps: ["moneySupplyM2"],
    compute: (v) => v.moneySupplyM2 - M2_2020,
  },
  shareCreatedSince2020: {
    kind: "derived",
    deps: ["moneySupplyM2"],
    compute: (v) => ((v.moneySupplyM2 - M2_2020) / v.moneySupplyM2) * 100,
  },
};

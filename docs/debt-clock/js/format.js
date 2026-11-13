// =============================================================================
//  format.js — number formatting for the clock
// =============================================================================

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const NUM = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });

// Full odometer-style currency: "$1,420,003,918,442"
export function money(n) {
  return CAD.format(Math.round(n));
}

// Currency with cents: "$33,654.17"
export function moneyCents(n) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Plain integer with thousands separators: "41,600,213"
export function count(n) {
  return NUM.format(Math.round(n));
}

// Abbreviated for context lines: "$1.42T", "$55.0B", "$500.0M"
export function abbrevMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return money(n);
}

// Percent: "46.6%"
export function pct(n, digits = 1) {
  return `${n.toFixed(digits)}%`;
}

// BTC with 8 decimals: "0.23211904 ₿"
export function btc(n, digits = 8) {
  return `${n.toFixed(digits)} ₿`;
}

// Sats, integer: "23,211,904 sats"
export function sats(n) {
  return `${NUM.format(Math.round(n))} sats`;
}

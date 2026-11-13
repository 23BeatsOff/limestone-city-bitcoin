// =============================================================================
//  provinces.js — per-province debt breakdown
// =============================================================================
//  Combined federal + provincial NET debt as a share of provincial GDP, 2025/26.
//  Source: Fraser Institute, "The Growing Debt Burden for Canadians: 2026".
//  `perPerson` is the combined federal+provincial net debt per resident where
//  Fraser published it (the four extremes); null otherwise.
// =============================================================================

export const PROVINCES = [
  { code: "MB", name: "Manitoba", debtToGDP: 91.3, perPerson: null },
  { code: "NL", name: "Newfoundland & Labrador", debtToGDP: 89.7, perPerson: 71611 },
  { code: "QC", name: "Quebec", debtToGDP: 89.1, perPerson: 63488 },
  { code: "NS", name: "Nova Scotia", debtToGDP: 89.1, perPerson: null },
  { code: "PE", name: "Prince Edward Island", debtToGDP: 88.8, perPerson: null },
  { code: "NB", name: "New Brunswick", debtToGDP: 88.1, perPerson: null },
  { code: "ON", name: "Ontario", debtToGDP: 82.7, perPerson: 63574 },
  { code: "BC", name: "British Columbia", debtToGDP: 69.0, perPerson: null },
  { code: "SK", name: "Saskatchewan", debtToGDP: 53.2, perPerson: null },
  { code: "AB", name: "Alberta", debtToGDP: 43.4, perPerson: 42368 },
];

// Sage (low burden) -> gold -> deep red (high burden), by debt-to-GDP.
// Muted stops from the site palette so the bars sit calmly on paper.
const SEVERITY_STOPS = [
  [141, 163, 147], // sage   #8DA393
  [199, 160, 76],  // gold   #C7A04C
  [162, 58, 42],   // red    #A23A2A
];
function severityColor(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const seg = t < 0.5 ? 0 : 1;
  const local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = SEVERITY_STOPS[seg], b = SEVERITY_STOPS[seg + 1];
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * local));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

export function renderProvinces(container) {
  if (!container) return;
  const values = PROVINCES.map((p) => p.debtToGDP);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sorted = [...PROVINCES].sort((a, b) => b.debtToGDP - a.debtToGDP);

  container.innerHTML = sorted
    .map((p) => {
      const color = severityColor(p.debtToGDP, min - 5, max);
      const width = (p.debtToGDP / max) * 100;
      return `
      <div class="prov-row">
        <span class="prov-name" title="${p.name}">${p.code}</span>
        <div class="prov-track">
          <div class="prov-fill" style="width:${width}%; background:${color}; color:${color}"></div>
        </div>
        <span class="prov-val">${p.debtToGDP.toFixed(1)}%</span>
      </div>`;
    })
    .join("");
}

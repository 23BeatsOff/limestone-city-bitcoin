// =============================================================================
//  ottawa-compare.js — rotating "For context, Ottawa spends $X on Y per year"
// =============================================================================
//  The interest bill runs ~$94 billion a year. To put that in perspective, the
//  line names a major federal program and what it actually costs. It cycles to
//  the next program every couple of hours, picked deterministically from the
//  clock so every visitor sees the same one at the same time.
//
//  Figures are total federal spending for 2024-25 (rounded to the nearest
//  billion); all sit below the ~$94B/year interest bill.
// =============================================================================

// `amount` fills the dollar figure, `program` completes
// "Ottawa spends <amount> on <program> per year".
export const PROGRAMS = [
  { amount: "$80&nbsp;billion", program: "Old Age Security" },
  { amount: "$52&nbsp;billion", program: "the Canada Health Transfer" },
  { amount: "$35&nbsp;billion", program: "national defence" },
  { amount: "$28&nbsp;billion", program: "Employment Insurance" },
  { amount: "$26&nbsp;billion", program: "the Canada Child Benefit" },
  { amount: "$9&nbsp;billion", program: "$10-a-day child care" },
];

const ROTATE_MS = 2 * 60 * 60 * 1000; // a couple of hours

// Deterministic pick: same window → same program for everyone.
function currentIndex(now = Date.now()) {
  return Math.floor(now / ROTATE_MS) % PROGRAMS.length;
}

export function initOttawaCompare(el) {
  if (!el) return;
  const apply = () => {
    const { amount, program } = PROGRAMS[currentIndex()];
    const html = `<span class="accent">${amount}</span> on ${program}`;
    if (el.innerHTML !== html) el.innerHTML = html;
  };
  apply();
  // Re-check periodically so a long-open tab rolls over on schedule.
  setInterval(apply, 60 * 1000);
}

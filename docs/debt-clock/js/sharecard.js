// =============================================================================
//  sharecard.js — generate a shareable "your share of the debt, in sats" image
// =============================================================================
//  Draws a 1080×1080 social card from a live snapshot and lets the user
//  download it (or share via the Web Share API on supported devices).
// =============================================================================

const SIZE = 1080;

const money = (n) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
const intl = (n) => new Intl.NumberFormat("en-CA").format(Math.round(n));

// Palette: matches the ambient sleeve site theme.
const INK = "#2B2A27";
const MUTED = "#5E5B55";
const DEBT = "#A23A2A";
const BTC = "#C7A04C";
const BTC_INK = "#7A5A1E";
const MONO = '"IBM Plex Mono", "Courier New", monospace';
const SANS = '"Work Sans", -apple-system, Segoe UI, Roboto, sans-serif';

export function drawCard(ctx, snap) {
  const debtPerCitizen = snap.debtPerCitizen;
  const sats = snap.yourShareInSats;
  const btc = snap.yourShareInBTC;
  const price = snap.btcPriceCAD;

  // Paper background
  ctx.fillStyle = "#ECE8E0";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // A lighter paper card with a thin ink rule along its top
  ctx.fillStyle = "#F4F1EB";
  ctx.fillRect(44, 46, SIZE - 88, SIZE - 88);
  ctx.fillStyle = INK;
  ctx.fillRect(44, 46, SIZE - 88, 2);

  ctx.textAlign = "center";

  // Brand: clock doodle + wordmark
  ctx.fillStyle = INK;
  ctx.font = `400 38px ${SANS}`;
  ctx.fillText("The Canadian Debt Clock", SIZE / 2, 150);
  ctx.fillStyle = DEBT;
  ctx.fillRect(SIZE / 2 - 150, 172, 300, 2);

  // Label
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${SANS}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
  ctx.fillText("MY SHARE OF THE NATIONAL DEBT", SIZE / 2, 275);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  // Debt per citizen (red, mono)
  ctx.fillStyle = DEBT;
  ctx.font = `300 116px ${MONO}`;
  ctx.fillText(money(debtPerCitizen), SIZE / 2, 400);

  // Divider
  ctx.fillStyle = DEBT; // the red hairline
  ctx.fillRect(400, 479, 280, 2);

  // "priced in hard money"
  ctx.fillStyle = MUTED;
  ctx.font = `300 34px ${SANS}`;
  ctx.fillText("priced in money that can't be printed", SIZE / 2, 552);

  // Sats (gold, huge, mono)
  ctx.fillStyle = BTC_INK;
  ctx.font = `300 154px ${MONO}`;
  ctx.fillText(intl(sats), SIZE / 2, 705);
  ctx.fillStyle = BTC_INK;
  ctx.font = `300 58px ${SANS}`;
  ctx.fillText("sats", SIZE / 2, 772);

  // BTC equivalent
  ctx.fillStyle = MUTED;
  ctx.font = `400 32px ${MONO}`;
  ctx.fillText(`= ${btc.toFixed(8)} ₿   at ${money(price)} / BTC`, SIZE / 2, 842);

  // Footer band
  ctx.fillStyle = "rgba(199,160,76,0.16)";
  ctx.fillRect(44, 928, SIZE - 88, 108);
  ctx.fillStyle = BTC_INK;
  ctx.font = `400 42px ${SANS}`;
  ctx.fillText("limestonecitybitcoin.com/debt-clock", SIZE / 2, 982);
  ctx.fillStyle = MUTED;
  ctx.font = `300 28px ${SANS}`;
  ctx.fillText("Fix the money, fix the country.", SIZE / 2, 1022);
}

async function exportCard(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], "my-debt-in-sats.png", { type: "image/png" });

  // Prefer native share (mobile) when it can share files.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "My share of Canada's debt",
        text: "My share of Canada's national debt, priced in Bitcoin. limestonecitybitcoin.com/debt-clock",
      });
      return;
    } catch {
      /* user cancelled — fall through to download */
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-debt-in-sats.png";
  a.click();
  URL.revokeObjectURL(url);
}

export function initShareCard(button, getSnapshot) {
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    const prev = button.textContent;
    button.textContent = "Generating…";
    try {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      drawCard(canvas.getContext("2d"), getSnapshot());
      await exportCard(canvas);
    } finally {
      button.textContent = prev;
      button.disabled = false;
    }
  });
}

// =============================================================================
//  tip.js — copy the Lightning tip address to the clipboard
// =============================================================================
//  The address is also a `lightning:` link for wallets that handle the scheme;
//  this just adds a one-tap copy fallback for everyone else.
// =============================================================================

export function initTip(button) {
  if (!button) return;
  const addr = button.dataset.addr;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      return; // clipboard blocked (e.g. insecure context) — leave the link
    }
    const prev = button.textContent;
    button.textContent = "Copied!";
    button.disabled = true;
    setTimeout(() => {
      button.textContent = prev;
      button.disabled = false;
    }, 1500);
  });
}

// =============================================================================
//  odometer.js — continuous digit-roll counter
// =============================================================================
//  Renders a number as a row of digit "wheels". Each wheel is a 0–9 ribbon
//  whose vertical position is the digit's CONTINUOUS value, so the ones place
//  rolls smoothly, the tens place rolls 1/10 as fast, and carries ease in
//  naturally — the classic odometer effect. No CSS transition needed: the
//  position is recomputed from the live value every frame.
// =============================================================================

export function createOdometer(el, { prefix = "$" } = {}) {
  el.classList.add("odometer");
  el.textContent = "";
  let len = -1;
  let wheels = []; // ribbons indexed left→right; null for separators

  function build(n) {
    el.innerHTML = "";
    wheels = [];
    if (prefix) {
      const p = document.createElement("span");
      p.className = "od-prefix";
      p.textContent = prefix;
      el.appendChild(p);
    }
    for (let i = 0; i < n; i++) {
      const posFromRight = n - 1 - i;
      const digit = document.createElement("span");
      digit.className = "od-digit";
      const ribbon = document.createElement("span");
      ribbon.className = "od-ribbon";
      for (let d = 0; d <= 10; d++) {
        const c = document.createElement("span");
        c.textContent = d % 10;
        ribbon.appendChild(c);
      }
      digit.appendChild(ribbon);
      el.appendChild(digit);
      wheels.push(ribbon);
      // Thousands separator after this digit.
      if (posFromRight > 0 && posFromRight % 3 === 0) {
        const sep = document.createElement("span");
        sep.className = "od-sep";
        sep.textContent = ",";
        el.appendChild(sep);
      }
    }
    len = n;
  }

  return {
    set(value) {
      value = Math.max(0, value);
      const n = String(Math.floor(value)).length;
      if (n !== len) build(n);
      for (let i = 0; i < n; i++) {
        const place = n - 1 - i; // 0 = ones
        const digit = Math.floor(value / Math.pow(10, place)) % 10;
        // A wheel sits on its integer digit and only rolls during a carry:
        // the ones wheel rolls continuously; a higher wheel rolls only while
        // the wheel just below it is passing through 9 → 0.
        let roll = 0;
        if (place === 0) {
          roll = value % 1;
        } else {
          const below = value / Math.pow(10, place - 1);
          if (Math.floor(below) % 10 === 9) roll = below % 1;
        }
        wheels[i].style.transform = `translateY(${-(digit + roll)}em)`;
      }
    },
  };
}

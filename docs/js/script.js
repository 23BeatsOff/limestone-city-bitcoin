/* 1. BITCOIN BLOCK HEIGHT LOGIC */

// Tried in order; if the first provider is down we fall back to the next.
const BLOCK_HEIGHT_APIS = [
    'https://mempool.space/api/blocks/tip/height',
    'https://blockstream.info/api/blocks/tip/height'
];

// Returns the current block height as a number, or null if every provider failed.
async function fetchBlockHeight() {
    for (const url of BLOCK_HEIGHT_APIS) {
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = (await response.text()).trim();
            const height = Number(text);

            // Guard against empty bodies, non-numeric text, and nonsense values.
            if (text && Number.isFinite(height) && height > 0) {
                return height;
            }
            throw new Error(`Unexpected payload: "${text}"`);
        } catch (err) {
            console.error(`Block height fetch failed (${url}):`, err);
            // Fall through and try the next provider.
        }
    }
    return null;
}

async function updateBlock() {
    const heightElement = document.getElementById('block-height');
    if (!heightElement) return;

    const height = await fetchBlockHeight();

    if (height !== null) {
        // Format with commas (e.g., 834,123)
        heightElement.innerText = height.toLocaleString();
    } else if (heightElement.innerText === "-------") {
        // Only show "Offline" if we never managed an initial load.
        // On a transient failure after a good read, keep the last known height.
        heightElement.innerText = "Offline";
    }
}

/* 2. MOSCOW TIME LOGIC (satoshis per US dollar) */

// Tried in order; each provider returns BTC/USD in a different shape.
const PRICE_APIS = [
    { url: 'https://mempool.space/api/v1/prices', extract: d => d.USD },
    { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot', extract: d => d.data && d.data.amount }
];

// Returns the BTC/USD spot price as a number, or null if every provider failed.
async function fetchBtcUsd() {
    for (const api of PRICE_APIS) {
        try {
            const response = await fetch(api.url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const price = Number(api.extract(data));

            if (Number.isFinite(price) && price > 0) {
                return price;
            }
            throw new Error('Unexpected price payload');
        } catch (err) {
            console.error(`BTC price fetch failed (${api.url}):`, err);
            // Fall through and try the next provider.
        }
    }
    return null;
}

// "Moscow Time" reads sats-per-dollar like a clock: a colon two digits from
// the right. It is intentionally not a real clock — minutes can exceed 59.
function formatMoscowTime(satsPerDollar) {
    const hours = Math.floor(satsPerDollar / 100);
    const minutes = satsPerDollar % 100;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
}

async function updateMoscowTime() {
    const el = document.getElementById('moscow-time');
    if (!el) return;

    const price = await fetchBtcUsd();

    if (price !== null) {
        // Floor: the whole satoshis you can actually buy for $1 (the
        // canonical Moscow Time reading, e.g. $69,420 -> 14:40).
        const satsPerDollar = Math.floor(100000000 / price);
        el.innerText = formatMoscowTime(satsPerDollar);
    } else if (el.innerText === "--:--") {
        // Only show "Offline" if we never managed an initial load.
        el.innerText = "Offline";
    }
}

/* 3. PHONE MENU LOGIC
   On wide screens the menu is a plain row of links and the button is hidden.
   On phones the "Menu" button opens the menu as a full-screen sheet. */
function setupMenu() {
    const menuToggle = document.querySelector('#mobile-menu');
    const navMenu = document.querySelector('#nav-menu');

    // Only run if both elements exist on the page
    if (!menuToggle || !navMenu) return;

    function setMenu(open) {
        navMenu.classList.toggle('active', open);
        menuToggle.classList.toggle('is-active', open);
        menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        menuToggle.textContent = open ? 'Close' : 'Menu';
        document.body.classList.toggle('menu-open', open);
    }

    menuToggle.addEventListener('click', () => {
        setMenu(!navMenu.classList.contains('active'));
    });

    // Close the menu when a link inside it is chosen
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => setMenu(false));
    });

    // Close the menu with the Escape key and return focus to the button
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && navMenu.classList.contains('active')) {
            setMenu(false);
            menuToggle.focus();
        }
    });

    // If the screen gets wide again (rotating a tablet), reset the menu
    window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => {
        if (e.matches) setMenu(false);
    });
}

/* 4. INITIALIZE EVERYTHING */
document.addEventListener('DOMContentLoaded', () => {
    // Run the live stats immediately
    updateBlock();
    updateMoscowTime();

    // Set up the hamburger menu
    setupMenu();

    // Refresh the live stats every 60 seconds
    setInterval(updateBlock, 60000);
    setInterval(updateMoscowTime, 60000);
});

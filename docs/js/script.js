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

/* 2. HAMBURGER MENU LOGIC */
function setupMenu() {
    const menuToggle = document.querySelector('#mobile-menu');
    const navMenu = document.querySelector('#nav-menu');

    // Only run if both elements exist on the page
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            // This 'active' class matches the CSS we just wrote
            navMenu.classList.toggle('active');
            
            // This allows for optional styling when the menu is open
            menuToggle.classList.toggle('is-active');
        });

        // Close the menu if a user clicks a link inside it
        document.querySelectorAll('.nav-menu a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
            });
        });

        // Close the menu if a user clicks anywhere outside the menu
        document.addEventListener('click', (event) => {
            const isClickInside = navMenu.contains(event.target) || menuToggle.contains(event.target);
            if (!isClickInside && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
            }
        });
    }
}

/* 3. INITIALIZE EVERYTHING */
document.addEventListener('DOMContentLoaded', () => {
    // Run block height update immediately
    updateBlock();
    
    // Set up the hamburger menu
    setupMenu();

    // Refresh block height every 60 seconds
    setInterval(updateBlock, 60000);
});

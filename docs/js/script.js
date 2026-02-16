/* 1. BITCOIN BLOCK HEIGHT LOGIC */
async function updateBlock() {
    const heightElement = document.getElementById('block-height');
    
    try {
        // Fetch current height from Mempool.space
        const response = await fetch('https://mempool.space/api/blocks/tip/height', {
            mode: 'cors'
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.text();
        
        if (data && !isNaN(data)) {
            // Update the text and format with commas (e.g., 834,123)
            heightElement.innerText = Number(data).toLocaleString();
        }
    } catch (err) {
        console.error("Mempool API error:", err);
        // If it fails and hasn't loaded yet, show "Offline"
        if (heightElement.innerText === "-------") {
            heightElement.innerText = "Offline";
        }
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

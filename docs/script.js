async function updateBlock() {
    try {
        // Fetching the current height from Mempool.space
        const response = await fetch('https://mempool.space/api/blocks/tip/height');
        const data = await response.text();
        
        // Ensure the data is a valid number
        if (!isNaN(data) && data.trim() !== "") {
            const heightElement = document.getElementById('block-height');
            if (heightElement) {
                heightElement.innerText = Number(data).toLocaleString();
            }
        }
    } catch (err) {
        console.error("Mempool API error:", err);
        const heightElement = document.getElementById('block-height');
        if (heightElement) {
            heightElement.innerText = "Offline";
        }
    }
}

// Run immediately on load
updateBlock();

// Refresh every 60 seconds
setInterval(updateBlock, 60000);

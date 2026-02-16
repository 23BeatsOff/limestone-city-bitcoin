async function updateBlock() {
    try {
        const response = await fetch('https://mempool.space/api/blocks/tip/height');
        const data = await response.text();
        if (!isNaN(data)) {
            document.getElementById('block-height').innerText = Number(data).toLocaleString();
        }
    } catch (err) {
        console.error("Fetch error:", err);
        document.getElementById('block-height').innerText = "Offline";
    }
}

// Initialize and set interval
updateBlock();
setInterval(updateBlock, 60000);

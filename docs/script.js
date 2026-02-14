/**
 * Fetches the current Bitcoin block height from Mempool.space
 */
async function fetchBlockHeight() {
    const blockDisplay = document.getElementById('block-height');
    
    try {
        const response = await fetch('https://mempool.space/api/blocks/tip/height');
        if (!response.ok) throw new Error('Network response was not ok');
        
        const height = await response.text();
        
        // Update the HTML with the new height
        blockDisplay.innerText = Number(height).toLocaleString(); 
    } catch (error) {
        console.error("Error fetching block height:", error);
        blockDisplay.innerText = "Connection Error";
    }
}

// Run immediately on load
fetchBlockHeight();

// Refresh every 60 seconds
setInterval(fetchBlockHeight, 60000);

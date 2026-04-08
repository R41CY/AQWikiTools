/**
 * @file Inventory synchronization for the AQW account page.
 * @description Fetches the player's full inventory from the AQW account API
 *   and persists it to chrome.storage.local. Other extension features
 *   (item marking, farm tracker, calculators) consume this stored data.
 */

if (window.location.href.includes("https://account.aq.com/AQW/Inventory")) {

    /** Fetch inventory data from the account API and save to local storage. */
    async function synchronizeInventory() {
        try {
            const response = await fetch(`/Aqw/InventoryData?_=${Date.now()}`);
            if (!response.ok) throw new Error("Network response was not ok");

            const json = await response.json();
            const allInventory = [];

            json.data.forEach(item => {
                let itemName = item[0];
                let quantity = 1;

                // Items with stacks are formatted as "ItemName x5"
                const match = itemName.match(/(.*?)\s+x(\d+)$/i);
                if (match) {
                    itemName = match[1].trim();
                    quantity = parseInt(match[2], 10);
                }

                allInventory.push({
                    name: itemName,
                    quantity,
                    location: item[3] || "Inventory",
                    rawName: item[0]
                });
            });

            chrome.storage.local.set({ savedInventory: allInventory }, () => {
                console.log(`Synchronized ${allInventory.length} items to local storage.`);
            });

        } catch (error) {
            console.error("Inventory sync failed:", error);
        }
    }

    synchronizeInventory();
}

/**
 * @file Popup hub controller for AQWikiTools.
 * @description Manages extension popup UI: dark mode toggles, inventory sync
 *   status display, boost information, data export, and the About section.
 */

// --- Version Display ---

const versionEl = document.getElementById("ext-version");
if (versionEl) {
    versionEl.textContent = "v" + chrome.runtime.getManifest().version;
}

// --- Theme Toggles ---

const btnWikiCheck = document.querySelector("#wiki-dark");
const btnCharCheck = document.querySelector("#char-dark");

if (btnWikiCheck && btnCharCheck) {
    chrome.storage.local.get(["savedTheme"], (result) => {
        if (result.savedTheme) {
            if (result.savedTheme.wikiDarkMode !== undefined) {
                btnWikiCheck.checked = result.savedTheme.wikiDarkMode;
            }
            if (result.savedTheme.charDarkMode !== undefined) {
                btnCharCheck.checked = result.savedTheme.charDarkMode;
            }
        }
    });

    btnWikiCheck.addEventListener("change", updateConfig);
    btnCharCheck.addEventListener("change", updateConfig);
}

// --- Hover Preview Toggle ---

const btnHoverPreview = document.querySelector("#hover-preview");
if (btnHoverPreview) {
    chrome.storage.local.get({ hoverPreviewEnabled: 1 }, (result) => {
        btnHoverPreview.checked = result.hoverPreviewEnabled !== 0;
    });

    btnHoverPreview.addEventListener("change", () => {
        chrome.storage.local.set({ hoverPreviewEnabled: btnHoverPreview.checked ? 1 : 0 });
    });
}

/** Persist theme config and notify the active content script. */
async function updateConfig() {
    if (!btnWikiCheck || !btnCharCheck) return;

    const config = {
        wikiDarkMode: btnWikiCheck.checked,
        charDarkMode: btnCharCheck.checked
    };

    chrome.storage.local.set({ savedTheme: config });

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: "updateTheme", theme: config }).catch(() => {});
        }
    } catch {
        // Tab may not be on a matched page
    }
}

// --- Farm Tracker Button ---

const btnToFarm = document.getElementById("btn-tofarm");
if (btnToFarm) {
    btnToFarm.addEventListener("click", () => {
        chrome.tabs.create({ url: "src/pages/farm-tracker.html" });
    });
}

// --- Export Account Data ---

const btnExport = document.getElementById("btn-export");
if (btnExport) {
    btnExport.addEventListener("click", () => {
        chrome.storage.local.get(["savedInventory"], (result) => {
            const data = result.savedInventory || [];
            if (data.length === 0) {
                btnExport.innerHTML = '<i class="fa-solid fa-circle-xmark btn-icon"></i> No data to export';
                setTimeout(() => {
                    btnExport.innerHTML = '<i class="fa-solid fa-file-export btn-icon"></i> Export Account Data';
                }, 2000);
                return;
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "AQWikiTools_AccountData.json";
            a.click();
            URL.revokeObjectURL(url);
            btnExport.innerHTML = '<i class="fa-solid fa-circle-check btn-icon" style="color:#2ecc71"></i> Exported!';
            setTimeout(() => {
                btnExport.innerHTML = '<i class="fa-solid fa-file-export btn-icon"></i> Export Account Data';
            }, 2000);
        });
    });
}

// --- Sync Status ---

const syncCountEl = document.getElementById("synced-count");
const syncStatusEl = document.getElementById("sync-status");

chrome.storage.local.get(["savedInventory"], (result) => {
    const inventory = result.savedInventory;
    if (inventory && inventory.length > 0) {
        if (syncCountEl) syncCountEl.textContent = inventory.length.toLocaleString();
        if (syncStatusEl) {
            syncStatusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Synced';
            syncStatusEl.classList.add("synced");
            syncStatusEl.classList.remove("not-synced");
        }
    } else {
        if (syncCountEl) syncCountEl.textContent = "0";
        if (syncStatusEl) {
            syncStatusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Not synced';
            syncStatusEl.classList.add("not-synced");
            syncStatusEl.classList.remove("synced");
        }
    }
});

// --- Boost Info ---

const boostSection = document.getElementById("boost-section");
const boostInfo = document.getElementById("boost-info");

chrome.storage.local.get(["boostCache"], (result) => {
    const cache = result.boostCache;
    if (cache && cache.expiresAt > Date.now() && cache.data && cache.data.length > 0) {
        if (boostSection) boostSection.style.display = "block";
        if (boostInfo) {
            boostInfo.innerHTML = '<i class="fa-solid fa-bolt" style="color:#f39c12;"></i> ' + cache.data.join(" | ");
        }
    }
});

// --- About Toggle ---

const aboutToggle = document.getElementById("about-toggle");
const aboutContent = document.getElementById("about-content");

if (aboutToggle && aboutContent) {
    aboutToggle.addEventListener("click", () => {
        aboutContent.classList.toggle("visible");
        aboutToggle.innerHTML = aboutContent.classList.contains("visible")
            ? '<i class="fa-solid fa-circle-xmark"></i> Close'
            : '<i class="fa-solid fa-circle-info"></i> About AQWikiTools';
    });
}

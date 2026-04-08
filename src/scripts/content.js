/**
 * @file Content script for AQW Wiki and Account pages.
 * @description Provides hover image previews, merge/quest material calculators,
 *   inventory ownership indicators, collection chest progress tracking,
 *   server boost banners, and dark theme support.
 */

// --- Utilities ---

/**
 * Escape untrusted strings for safe HTML interpolation.
 * @param {string} str - Raw string to sanitize.
 * @returns {string} HTML-entity-escaped string.
 */
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Remove wiki tag suffixes like "(Class)", "(Armor)", "(AC)" from item names.
 * @param {string} itemName - Raw item name from wiki or inventory.
 * @returns {string} Cleaned base name suitable for cross-source matching.
 */
function getBaseName(itemName) {
    return itemName.replace(
        /\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Legend|Non-Legend|Merge|Rare|VIP|Monster)\)/gi,
        ""
    ).trim();
}

const IS_MANAGE_ACCOUNT = window.location.href.includes("account.aq.com/AQW/Inventory");
const IS_CHAR_PAGE = window.location.href.includes("account.aq.com/CharPage");
const IS_WIKI_PAGE = window.location.href.includes("aqwwiki.wikidot.com");

// --- Hover Image Preview ---

const container = document.createElement("div");
container.className = "content-view";
document.body.appendChild(container);

const bodyContainer = document.querySelector("body");
const links = document.querySelectorAll("a");
bodyContainer.classList.add("container");
links.forEach(link => link.classList.add("link-style"));

let hoverTimeout;
let hoverPreviewEnabled = true;

chrome.storage.local.get({ hoverPreviewEnabled: 1 }, (result) => {
    hoverPreviewEnabled = result.hoverPreviewEnabled !== 0;
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.hoverPreviewEnabled) {
        hoverPreviewEnabled = changes.hoverPreviewEnabled.newValue !== 0;
    }
});

const imageCache = new Map();

document.addEventListener("mouseover", (e) => {
    if (!hoverPreviewEnabled) return;

    let urlToSearch = null;
    const link = e.target.closest("a");

    if (link && link.href.startsWith("http://aqwwiki.wikidot.com/") && !link.closest("sub") && !link.closest("#top-bar") && !link.closest("#side-bar") && !link.closest("#breadcrumbs")) {
        urlToSearch = link.href;
    } else if (IS_MANAGE_ACCOUNT && e.target.tagName === "TD") {
        const td = e.target;
        if (td.parentElement && td.parentElement.firstElementChild === td && td.textContent.trim() !== "") {
            urlToSearch = generateWikiUrlFromText(td.textContent);
        }
    }

    if (!urlToSearch) return;

    clearTimeout(hoverTimeout);

    hoverTimeout = setTimeout(async () => {
        if (imageCache.has(urlToSearch)) {
            showImage(imageCache.get(urlToSearch));
            return;
        }

        try {
            const imgSrc = await getImage(urlToSearch);
            if (imgSrc && imgSrc.images) {
                imageCache.set(urlToSearch, imgSrc);
                showImage(imgSrc);
            }
        } catch (err) {
            console.error("Hover preview error:", err);
        }
    }, 100);
});

document.addEventListener("mouseout", (e) => {
    if (e.target.closest("a") || (IS_MANAGE_ACCOUNT && e.target.tagName === "TD")) {
        container.classList.remove("visible");
        while (container.firstChild) container.removeChild(container.firstChild);
        clearTimeout(hoverTimeout);
    }
});

/**
 * Render fetched image data into the hover preview tooltip.
 * @param {{ images: string[], description: HTMLElement|null }} data
 */
function showImage(data) {
    while (container.firstChild) container.removeChild(container.firstChild);
    container.classList.add("visible");

    const imgContainer = document.createElement("div");
    imgContainer.className = "img-container";
    container.appendChild(imgContainer);

    const typeImage = data.images.length > 1 ? "img-multiple" : "img-single";
    data.images.forEach(src => {
        const imgElement = document.createElement("img");
        imgElement.src = src;
        imgElement.className = `img-add ${typeImage}`;
        imgContainer.appendChild(imgElement);
    });

    if (data.description) {
        container.appendChild(data.description);
    }
}

/**
 * Determine whether an image URL is an actual item preview (not a UI icon).
 * @param {string} srcImg - Image source URL.
 * @returns {boolean}
 */
function isValidImg(srcImg) {
    if (!srcImg) return false;
    const url = srcImg.toLowerCase();
    const blocklist = ["/image-tags/", "acsmall", "aclarge", "raresmall", "legendsmall", "membersmall", "map", "npc"];
    return !blocklist.some(word => url.includes(word));
}

/**
 * Fetch a wiki page via the background service worker and extract preview images.
 * Follows disambiguation links up to one level deep.
 * @param {string} url - Wiki page URL.
 * @param {number} [attempt=1] - Current recursion depth (max 2).
 * @returns {Promise<{images: string[], description: HTMLElement|null}|null>}
 */
async function getImage(url, attempt = 1) {
    return new Promise((resolve) => {
        if (attempt > 2) return resolve(null);

        chrome.runtime.sendMessage({ action: "fetchWikiHTML", url }, async (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                return resolve(null);
            }

            try {
                const doc = new DOMParser().parseFromString(response.html, "text/html");
                let foundImages = [];

                const imgMale = doc.querySelector("#wiki-tab-0-0 img");
                const imgFemale = doc.querySelector("#wiki-tab-0-1 img");

                if (imgMale && isValidImg(imgMale.src)) foundImages.push(imgMale.src);
                if (imgFemale && isValidImg(imgFemale.src)) foundImages.push(imgFemale.src);

                if (foundImages.length === 0) {
                    const allImages = Array.from(doc.querySelectorAll("#page-content img"));
                    const allPathLinks = Array.from(doc.querySelectorAll("#breadcrumbs a"));

                    const isBlockedCategory = allPathLinks.some(link => {
                        const text = link.textContent.trim();
                        return text === "Quests" || text === "Shops" || text === "Factions";
                    });

                    if (isBlockedCategory) return resolve(null);

                    let singleImg = allImages.find(img => {
                        const src = img.src.toLowerCase();
                        return isValidImg(src) && src.includes("imgur.com");
                    });

                    if (!singleImg) {
                        singleImg = allImages.find(img => !img.src.includes("/image-tags/"));
                    }

                    if (singleImg) foundImages.push(singleImg.src);
                }

                // Disambiguation: follow the first internal link if no images found
                if (foundImages.length === 0) {
                    const pageLinks = Array.from(doc.querySelectorAll("#page-content a"));
                    const disambiguationLink = pageLinks.find(a => {
                        const href = a.getAttribute("href");
                        if (!href) return false;
                        const hrefLower = href.toLowerCase();
                        return href.startsWith("/") && !hrefLower.includes(":") && !hrefLower.includes("npc");
                    });

                    if (disambiguationLink) {
                        const newUrl = "http://aqwwiki.wikidot.com" + disambiguationLink.getAttribute("href");
                        const result = await getImage(newUrl, attempt + 1);
                        return resolve(result);
                    }
                }

                const paragraphs = doc.querySelectorAll("#page-content p");
                let descriptionIndex = 2;
                for (let i = 0; i < paragraphs.length; i++) {
                    if (paragraphs[i].textContent.includes("Location:")) {
                        descriptionIndex = i;
                        break;
                    }
                }

                resolve({
                    images: foundImages,
                    description: paragraphs[descriptionIndex] || null
                });

            } catch (err) {
                console.error("Error processing wiki HTML:", err);
                resolve(null);
            }
        });
    });
}

// --- Theme Management ---

/**
 * Apply or remove dark theme CSS classes based on the saved configuration.
 * @param {{ wikiDarkMode: boolean, charDarkMode: boolean }} theme
 */
function setThemePage(theme) {
    if (IS_WIKI_PAGE) {
        document.body.classList.toggle("tema-escuro-wiki", !!theme.wikiDarkMode);
    } else if (IS_CHAR_PAGE) {
        document.body.classList.toggle("tema-escuro-char", !!theme.charDarkMode);
    }
}

// --- Merge / Quest Calculator ---

let targetNavset = document.querySelector(".yui-navset");
document.addEventListener("click", (event) => {
    const clickedNavset = event.target.closest(".yui-navset");
    if (clickedNavset) targetNavset = clickedNavset;
});

const pageTitle = document.querySelector("#page-title");
const breadcrumbLinks = document.querySelectorAll("#breadcrumbs a");

const isMergePage = (pageTitle && pageTitle.textContent.includes("Merge")) ||
    (breadcrumbLinks && Array.from(breadcrumbLinks).some(a => a.textContent.includes("Merge")));
const isQuestPage = (pageTitle && pageTitle.textContent.includes("Quest")) ||
    (breadcrumbLinks && Array.from(breadcrumbLinks).some(a => a.textContent.includes("Quest")));

if (isMergePage || isQuestPage) {

    chrome.storage.local.get(["savedInventory"], (result) => {
        const rawInventory = result.savedInventory || [];

        const inventoryCount = {};
        if (Array.isArray(rawInventory)) {
            rawInventory.forEach(item => {
                const cleanName = getBaseName(item.name);
                inventoryCount[cleanName] = (inventoryCount[cleanName] || 0) + parseInt(item.quantity || 1, 10);
            });
        }

        /**
         * Parse merge shop table rows.
         * @param {boolean} filterAC - Show only AC items.
         * @param {boolean} filterLegend - Show only Legend items.
         * @returns {{ requiredTotals: Object, countItems: number, ownedShopItems: number }}
         */
        function parseMergeRequirements(filterAC, filterLegend) {
            const requiredTotals = {};
            let countItems = 0;
            let ownedShopItems = 0;

            const tableRows = document.querySelectorAll(".wiki-content-table tr");

            tableRows.forEach(tr => {
                const tds = tr.querySelectorAll("td");
                const tdItem = tds[1];
                const tdPrice = tds[2];

                if (!tdItem || !tdPrice) return;

                const itemLink = tdItem.querySelector("a");
                if (!itemLink) return;

                const itemContent = tdItem.innerHTML;
                const itemText = tdItem.textContent;

                const isAC = itemContent.includes("acsmall.png") || itemContent.includes("aclarge.png") || /\bAC\b/.test(itemText);
                const isLegend = itemContent.includes("membersmall.png") || itemContent.includes("memberlarge.png") || itemContent.includes("legendsmall.png") || /\bLegend\b/i.test(itemText);

                if (filterAC || filterLegend) {
                    let meetsCriteria = false;
                    if (filterAC && isAC) meetsCriteria = true;
                    if (filterLegend && isLegend) meetsCriteria = true;
                    if (!meetsCriteria) return;
                }

                countItems++;
                const cleanShopName = getBaseName(itemLink.textContent);

                if (inventoryCount[cleanShopName]) {
                    ownedShopItems++;
                    return;
                }

                const materials = tdPrice.querySelectorAll("a");
                materials.forEach(materialLink => {
                    const materialName = getBaseName(materialLink.textContent);
                    const quantityText = materialLink.nextSibling ? materialLink.nextSibling.textContent : "";
                    const qtyMatch = quantityText.match(/x\s*([\d,]+)/i);
                    const requiredQty = qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, ""), 10) : 1;
                    requiredTotals[materialName] = (requiredTotals[materialName] || 0) + requiredQty;
                });
            });

            return { requiredTotals, countItems, ownedShopItems };
        }

        /**
         * Parse quest requirements from the active tab.
         * @param {number} questMultiplier - Number of times to complete the quest.
         * @returns {{ requiredTotals: Object, countItems: number, questTitle: string }}
         */
        function parseQuestRequirements(questMultiplier) {
            const requiredTotals = {};
            let countItems = 0;
            let questTitleText = "";

            let activeTab = null;
            let activeTabLink = null;
            if (targetNavset) {
                activeTab = targetNavset.querySelector('.yui-content > div[style*="block"]');
                activeTabLink = targetNavset.querySelector(".yui-nav .selected a em");
            }

            if (!activeTab) return { requiredTotals, countItems, questTitle: questTitleText };

            const boldTags = Array.from(activeTab.querySelectorAll("strong, b"));
            const reqTag = boldTags.find(tag => tag.textContent.includes("Items Required:") || tag.textContent.includes("Requires:"));

            if (activeTabLink) questTitleText = activeTabLink.textContent;

            if (reqTag) {
                let currentElement = reqTag.parentElement;
                let ul = currentElement.nextElementSibling;

                while (ul && ul.tagName !== "UL") ul = ul.nextElementSibling;

                if (ul) {
                    countItems = 1;

                    Array.from(ul.children).forEach(li => {
                        if (li.tagName !== "LI") return;
                        const clone = li.cloneNode(true);
                        clone.querySelectorAll("ul, img").forEach(el => el.remove());

                        let text = clone.textContent.replace(/[\n\r\t]/g, "").trim();
                        if (!text) return;
                        const textMatch = text.match(/^(.*?)(?:\s*x\s*([\d,]+))?$/i);

                        if (textMatch) {
                            const rawItemName = textMatch[1].trim().replace(/"/g, "");
                            const materialName = getBaseName(rawItemName);
                            const baseQty = textMatch[2] ? parseInt(textMatch[2].replace(/,/g, ""), 10) : 1;
                            requiredTotals[materialName] = (requiredTotals[materialName] || 0) + (baseQty * questMultiplier);
                        }
                    });
                }
            }

            return { requiredTotals, countItems, questTitle: questTitleText };
        }

        /**
         * Build the calculator DOM panel and insert it above the wiki tabs.
         * @returns {HTMLDivElement|undefined}
         */
        function buildCalculatorUI(requiredTotals, countItems, ownedShopItems, questTitleText, filterAC, filterLegend, questMultiplier) {
            if (countItems === 0 && !filterAC && !filterLegend) return;

            const safe = escapeHtml;

            const panelTitle = isQuestPage
                ? `Quest Farm Calculator - <span class="aqwt-calc-quest-name">${safe(questTitleText)}</span>`
                : "Merge Calculator";

            const subTitle = isQuestPage
                ? "Requirements Status"
                : `Shop Items Obtained: <b class="aqwt-calc-count">${ownedShopItems} / ${countItems}</b>`;

            let calculatorHtml = `
                <div class="aqwt-calc">
                    <div class="aqwt-calc-header">
                        <h3 class="aqwt-calc-title">${panelTitle}</h3>
                        <span class="aqwt-calc-subtitle">${subTitle}</span>
                    </div>
                    <div class="aqwt-calc-body">`;

            if (isMergePage) {
                calculatorHtml += `
                    <div class="aqwt-calc-filters">
                        <span class="aqwt-calc-filters-label">Filters:</span>
                        <label class="aqwt-calc-filter-opt">
                            <input type="checkbox" id="chk-merge-ac" ${filterAC ? "checked" : ""}> Only AC
                        </label>
                        <label class="aqwt-calc-filter-opt">
                            <input type="checkbox" id="chk-merge-legend" ${filterLegend ? "checked" : ""}> Only Legend
                        </label>
                    </div>`;
            } else if (isQuestPage) {
                calculatorHtml += `
                    <div class="aqwt-calc-filters">
                        <span class="aqwt-calc-filters-label">Quest Turn-ins:</span>
                        <input type="number" id="quest-multiplier-input" class="aqwt-quest-input" min="1" value="${parseInt(questMultiplier, 10)}">
                    </div>`;
            }

            if (countItems === 0 && isMergePage) {
                calculatorHtml += `
                    <div class="aqwt-calc-empty">No items match the selected filters.</div>
                    </div></div>`;
            } else if (isMergePage && ownedShopItems === countItems) {
                calculatorHtml += `
                    <div class="aqwt-calc-complete">
                        <h2>100% Completed!</h2>
                        <p>You already own all items from this shop (based on current filters).</p>
                    </div>
                    </div></div>`;
            } else {
                let totalMaterialsNeeded = 0;
                let totalMaterialsGathered = 0;

                for (const [material, totalNeeded] of Object.entries(requiredTotals)) {
                    const qtyInInventory = inventoryCount[material] || 0;
                    totalMaterialsNeeded += totalNeeded;
                    totalMaterialsGathered += Math.min(qtyInInventory, totalNeeded);
                }

                const mergeProgressPct = totalMaterialsNeeded > 0 ? Math.round((totalMaterialsGathered / totalMaterialsNeeded) * 100) : 0;
                const barCls = mergeProgressPct === 100 ? "aqwt-progress-fill complete" : "aqwt-progress-fill";
                const progressMsg = isQuestPage
                    ? `Progress to complete this Quest <b>${parseInt(questMultiplier, 10)}x</b> times:`
                    : "Total materials progress to purchase <b>missing items</b>:";

                calculatorHtml += `
                    <p class="aqwt-calc-progress-label">${progressMsg}</p>
                    <div class="aqwt-progress-bar">
                        <div class="${barCls}" style="width:${mergeProgressPct}%">${mergeProgressPct}%</div>
                    </div>
                    <table class="aqwt-calc-table">
                        <thead>
                            <tr>
                                <th>Requirement</th>
                                <th>Needed</th>
                                <th>You Have</th>
                                <th>Missing</th>
                            </tr>
                        </thead>
                        <tbody>`;

                for (const [material, totalNeeded] of Object.entries(requiredTotals)) {
                    const qtyInInventory = inventoryCount[material] || 0;
                    const missingQty = Math.max(0, totalNeeded - qtyInInventory);
                    const statusCls = missingQty === 0 ? "ready" : "missing";
                    const missingText = missingQty === 0 ? "Ready" : `${missingQty}`;

                    calculatorHtml += `
                        <tr>
                            <td class="aqwt-cell-name"><strong>${safe(material)}</strong></td>
                            <td class="aqwt-cell-center">${totalNeeded}</td>
                            <td class="aqwt-cell-center aqwt-cell-have">${qtyInInventory}</td>
                            <td class="aqwt-cell-center aqwt-cell-${statusCls}">${missingText}</td>
                        </tr>`;
                }

                calculatorHtml += `</tbody></table></div></div>`;
            }

            const oldCalc = document.getElementById("calc-merge-extension");
            if (oldCalc) oldCalc.remove();

            const calcDiv = document.createElement("div");
            calcDiv.id = "calc-merge-extension";
            calcDiv.innerHTML = calculatorHtml;

            const tabsArea = document.querySelector(".yui-navset");
            const pageContent = document.querySelector("#page-content");

            if (tabsArea) {
                tabsArea.parentNode.insertBefore(calcDiv, tabsArea);
            } else if (pageContent) {
                pageContent.insertBefore(calcDiv, pageContent.firstChild);
            }

            return calcDiv;
        }

        /** Bind event handlers to the calculator filter and multiplier controls. */
        function attachCalculatorListeners() {
            if (isMergePage) {
                const chkAc = document.getElementById("chk-merge-ac");
                const chkLegend = document.getElementById("chk-merge-legend");

                if (chkAc) chkAc.addEventListener("change", (e) => updateCalculator(e.target.checked, chkLegend?.checked, 1));
                if (chkLegend) chkLegend.addEventListener("change", (e) => updateCalculator(chkAc?.checked, e.target.checked, 1));
            } else if (isQuestPage) {
                const questInput = document.getElementById("quest-multiplier-input");
                if (questInput) {
                    questInput.addEventListener("change", (e) => {
                        let val = parseInt(e.target.value, 10);
                        if (isNaN(val) || val < 1) val = 1;
                        updateCalculator(false, false, val);
                    });
                }
            }
        }

        /**
         * Re-parse requirements and rebuild the calculator UI.
         * @param {boolean} filterAC
         * @param {boolean} filterLegend
         * @param {number} questMultiplier
         */
        function updateCalculator(filterAC = false, filterLegend = false, questMultiplier = 1) {
            try {
                let requiredTotals, countItems, ownedShopItems, questTitleText;

                if (isMergePage) {
                    const mergeData = parseMergeRequirements(filterAC, filterLegend);
                    requiredTotals = mergeData.requiredTotals;
                    countItems = mergeData.countItems;
                    ownedShopItems = mergeData.ownedShopItems;
                    questTitleText = "";
                } else {
                    const questData = parseQuestRequirements(questMultiplier);
                    requiredTotals = questData.requiredTotals;
                    countItems = questData.countItems;
                    ownedShopItems = 0;
                    questTitleText = questData.questTitle;
                }

                buildCalculatorUI(requiredTotals, countItems, ownedShopItems, questTitleText, filterAC, filterLegend, questMultiplier);
                attachCalculatorListeners();
            } catch (err) {
                console.error("Calculator error:", err);
            }
        }

        updateCalculator(false, false, 1);

        // Re-calculate when switching quest tabs
        if (isQuestPage) {
            const tabLinks = document.querySelectorAll(".yui-nav a");
            tabLinks.forEach(tab => {
                tab.addEventListener("click", () => {
                    setTimeout(() => {
                        const questInput = document.getElementById("quest-multiplier-input");
                        const mult = questInput ? parseInt(questInput.value, 10) : 1;
                        updateCalculator(false, false, mult);
                    }, 50);
                });
            });
        }
    });
}

// --- Wiki URL Generation ---

/**
 * Convert raw inventory item text into a wiki URL slug.
 * @param {string} rawText - Text from an inventory table cell.
 * @returns {string} Full wiki URL.
 */
function generateWikiUrlFromText(rawText) {
    let cleanName = rawText.trim();

    const match = cleanName.match(/(.*?)\s+x(\d+)$/i);
    if (match) cleanName = match[1].trim();

    cleanName = getBaseName(cleanName);

    let slug = cleanName.toLowerCase();
    slug = slug.replace(/'/g, "-").replace(/\s+/g, "-");
    slug = slug.replace(/[^a-z0-9\-]/g, "");
    slug = slug.replace(/-+/g, "-");

    return `http://aqwwiki.wikidot.com/${slug}`;
}

// --- Inventory Item Marking ---

/**
 * Append an ownership icon to a wiki link element.
 * @param {HTMLElement} link - The link or title element to annotate.
 * @param {string} [location="Inventory"] - "Inventory" or "Bank".
 */
function haveItem(link, location = "Inventory") {
    const icon = document.createElement("span");
    icon.className = "aqwt-owned-badge";

    const inventoryImg = location === "Inventory"
        ? chrome.runtime.getURL("assets/images/inventory.png")
        : chrome.runtime.getURL("assets/images/bank.png");

    const img = document.createElement("img");
    img.src = inventoryImg;
    img.alt = location;
    img.className = "aqwt-owned-icon";
    icon.appendChild(img);

    icon.title = `You already have this item in your ${escapeHtml(location)}!`;
    link.classList.add("aqwt-owned-link");
    link.appendChild(icon);
}

// --- Character Page: Mark Owned Items ---

if (IS_CHAR_PAGE) {

    chrome.storage.local.get(["savedInventory"], (result) => {
        const inventory = result.savedInventory;
        if (!inventory || inventory.length === 0) return;

        const inventoryNames = new Set(inventory.map(item => getBaseName(item.name)));

        let debounceTimer;
        function markOwnedItems() {
            const allLinks = document.querySelectorAll("a");

            allLinks.forEach(link => {
                if (!link.textContent) return;
                if (link.classList.contains("item-marcado")) return;
                link.classList.add("link-style");

                const itemName = link.textContent.trim().replace(/\s*\(Rank\s+\d+\)/i, "").trim();

                if (inventoryNames.has(itemName)) {
                    const icon = document.createElement("span");
                    icon.textContent = " [Owned]";
                    icon.className = "aqwt-owned-badge";
                    icon.title = "You already have this item!";

                    link.appendChild(icon);
                    link.classList.add("item-marcado");
                    link.classList.add("aqwt-owned-link");
                }
            });
        }

        markOwnedItems();

        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(markOwnedItems, 200);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// --- Wiki Page: Mark Items with Inventory/Bank Icons ---

chrome.storage.local.get(["savedInventory"], (result) => {
    const rawInventory = result.savedInventory;
    if (!rawInventory || rawInventory.length === 0) return;

    const inventoryNames = new Set(rawInventory.map(item => getBaseName(item.name)));

    const wikiPageTitle = document.querySelector("#page-title");
    const wikiLinks = document.querySelectorAll("#page-content a");

    wikiLinks.forEach(link => {
        const itemName = getBaseName(link.textContent);

        if (inventoryNames.has(itemName)) {
            if (rawInventory.some(item => getBaseName(item.name) === itemName && item.location.toLowerCase().includes("bank"))) {
                haveItem(link, "Bank");
            } else {
                haveItem(link, "Inventory");
            }
        }
    });

    if (wikiPageTitle) {
        const cleanTitle = getBaseName(wikiPageTitle.textContent);

        if (inventoryNames.has(cleanTitle)) {
            if (rawInventory.some(item => getBaseName(item.name) === cleanTitle && item.location.toLowerCase().includes("bank"))) {
                haveItem(wikiPageTitle, "Bank");
            } else {
                haveItem(wikiPageTitle, "Inventory");
            }
        }
    }

    // Collection Chests progress tracker
    if (wikiPageTitle && wikiPageTitle.textContent.trim() === "List of all Collection Chests") {
        const chestLinks = document.querySelectorAll(".list-pages-box p a");
        let totalChests = 0;
        let ownedChests = 0;

        chestLinks.forEach(link => {
            const chestName = getBaseName(link.textContent);
            if (chestName) {
                totalChests++;
                if (inventoryNames.has(chestName)) ownedChests++;
            }
        });

        if (totalChests > 0) {
            const pct = Math.round((ownedChests / totalChests) * 100);
            const barCls = pct === 100 ? "aqwt-progress-fill complete" : "aqwt-progress-fill";

            const statsDiv = document.createElement("div");
            statsDiv.className = "aqwt-chest-progress";

            const title = document.createElement("strong");
            title.className = "aqwt-chest-title";
            title.textContent = "Collection Chests Progress";
            statsDiv.appendChild(title);

            const counts = document.createElement("span");
            counts.className = "aqwt-chest-counts";
            counts.innerHTML = `<span class="aqwt-cell-have">${ownedChests}</span> / <span>${totalChests}</span> chests (${pct}%)`;
            statsDiv.appendChild(counts);

            const barWrap = document.createElement("div");
            barWrap.className = "aqwt-progress-bar";
            const barFill = document.createElement("div");
            barFill.className = barCls;
            barFill.style.width = pct + "%";
            barFill.textContent = pct + "%";
            barWrap.appendChild(barFill);
            statsDiv.appendChild(barWrap);

            const contentDiv = document.querySelector("#page-content");
            if (contentDiv) contentDiv.insertBefore(statsDiv, contentDiv.firstChild);
        }
    }
});

// --- Server Boost Banner ---

/**
 * Render the active server boost banner below the page title.
 * @param {string[]} boostsText - Array of active boost names.
 */
function displayBoostBanner(boostsText) {
    if (!boostsText || boostsText.length === 0 || document.getElementById("aqw-boost-banner")) return;

    let boostImg = null;
    const firstBoost = boostsText[0].toLowerCase();

    if (firstBoost.includes("double exp")) {
        boostImg = chrome.runtime.getURL("assets/images/xp-boost.png");
    } else if (firstBoost.includes("double class")) {
        boostImg = chrome.runtime.getURL("assets/images/class-boost.png");
    } else if (firstBoost.includes("double rep")) {
        boostImg = chrome.runtime.getURL("assets/images/rep-boost.png");
    } else {
        boostImg = chrome.runtime.getURL("assets/images/gold-boost.png");
    }

    const banner = document.createElement("div");
    banner.id = "aqw-boost-banner";

    if (boostImg) {
        const img = document.createElement("img");
        img.src = boostImg;
        img.alt = "Boost Icon";
        banner.appendChild(img);
    }

    const label = document.createTextNode(" Active Server Boosts: ");
    banner.appendChild(label);

    const boostSpan = document.createElement("span");
    boostSpan.className = "aqwt-boost-text";
    boostSpan.textContent = boostsText.join(" | ");
    banner.appendChild(boostSpan);

    const titleEl = document.querySelector("#page-title");
    if (titleEl) titleEl.appendChild(banner);
}

/**
 * Fetch the Artix calendar and extract the most recent active server boost.
 * Parses JS event objects via regex to identify "Double XP/Class/Rep/Gold/All" events.
 */
function fetchAndUpdateBoosts() {
    chrome.runtime.sendMessage({ action: "fetchArtixCalendar" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) return;

        try {
            const html = response.data;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let activeBoost = null;
            let shortestTimeDifference = Infinity;

            const eventRegex = /title:\s*'([^']+)'[\s\S]*?start:\s*'([^']+)'/g;
            let match;

            while ((match = eventRegex.exec(html)) !== null) {
                let eventText = match[1].replace(/\\u[\dA-F]{4}/gi, (m) => {
                    return String.fromCharCode(parseInt(m.replace(/\\u/g, ""), 16));
                }).trim();

                const eventDateStr = match[2];
                const textLower = eventText.toLowerCase();

                const isCoreBoost = textLower.includes("double exp") ||
                    textLower.includes("double class") ||
                    textLower.includes("double rep") ||
                    textLower.includes("double gold") ||
                    textLower.includes("double all");

                if (isCoreBoost) {
                    const eventDate = new Date(eventDateStr + "T00:00:00");
                    if (eventDate <= today) {
                        const daysDifference = today - eventDate;
                        if (daysDifference < shortestTimeDifference) {
                            shortestTimeDifference = daysDifference;
                            activeBoost = eventText;
                        }
                    }
                }
            }

            const foundBoosts = [];
            if (activeBoost) {
                const cleanBoostName = activeBoost.replace(/\s+\d{1,2}\.\d{1,2}\.\d{2,4}$/, "").trim();
                foundBoosts.push(cleanBoostName);
            }

            // Cache boosts for 12 hours
            chrome.storage.local.set({
                boostCache: {
                    data: foundBoosts,
                    expiresAt: Date.now() + (12 * 60 * 60 * 1000)
                }
            });

            if (foundBoosts.length > 0) displayBoostBanner(foundBoosts);

        } catch (error) {
            console.error("Error parsing boost calendar:", error);
        }
    });
}

chrome.storage.local.get(["boostCache"], (result) => {
    const cache = result.boostCache;
    if (cache && cache.expiresAt > Date.now()) {
        if (cache.data && cache.data.length > 0) displayBoostBanner(cache.data);
    } else {
        fetchAndUpdateBoosts();
    }
});

// --- Theme Initialization & Message Handler ---

chrome.storage.local.get(["savedTheme"], (result) => {
    if (result.savedTheme) setThemePage(result.savedTheme);
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateTheme") {
        setThemePage(message.theme);
    }
});

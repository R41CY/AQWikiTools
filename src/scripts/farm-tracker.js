/**
 * @file Farm Tracker for AQWikiTools.
 * @description Tabbed card-grid UI for browsing unowned wiki items across
 *   drop sources, merge shops, and quest rewards. Includes item detail modals,
 *   bank inventory view, completion statistics, and paginated search.
 */

// --- Constants & State ---

const ITEMS_PER_PAGE = 48;
const GROUPS_PER_PAGE = 15;

const GRID_SIZE_CONFIG = {
    compact: { item: "155px", group: "195px" },
    medium: { item: "185px", group: "230px" },
    large: { item: "220px", group: "280px" }
};

const MISSING_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'>"
    + "<rect width='320' height='320' fill='#0e0e18'/>"
    + "<rect x='24' y='24' width='272' height='272' fill='none' stroke='#2a2a3a' stroke-width='2' stroke-dasharray='10 8'/>"
    + "<text x='160' y='148' text-anchor='middle' fill='#555' font-family='Inter, Arial, sans-serif' font-size='18'>NO IMAGE</text>"
    + "<text x='160' y='176' text-anchor='middle' fill='#444' font-family='Inter, Arial, sans-serif' font-size='12'>Wiki art unavailable</text>"
    + "</svg>"
);

const FA_ICONS = {
    ac:       "fa-gem",
    legend:   "fa-crown",
    seasonal: "fa-snowflake",
    rare:     "fa-trophy",
    pseudo:   "fa-star",
    drop:     "fa-skull-crossbones",
    merge:    "fa-object-group",
    quest:    "fa-scroll",
    shop:     "fa-cart-shopping",
    location: "fa-map-pin",
    npc:      "fa-user",
    type:     "fa-tag"
};

const _escapeEl = document.createElement("div");

let wikiData = null;
let mergeShopsData = null;
let questsData = null;
let locationsData = null;
let dropRatesData = null;
let accountItems = [];
let accountItemSet = new Set();
let accountByName = {};
let searchTerm = "";
let activeTab = "todrop";
let searchTimer = null;
let filterTimer = null;

const tabState = {
    todrop:    { page: 0, items: [] },
    tomerge:   { page: 0, groups: [] },
    toquest:   { page: 0, groups: [] },
    inbank:    { page: 0, items: [] },
    completed: { page: 0, sections: [] }
};

const imageCache = new Map();

const buildCache = {
    todrop:    { key: "", items: null },
    tomerge:   { key: "", groups: null },
    toquest:   { key: "", groups: null },
    inbank:    { key: "", items: null },
    completed: { key: "", stats: null }
};

let lazyImageObserver = null;
let monsterLocationIndex = null;
let wikiDataLowerIndex = null;
let mergeShopBySlug = null;
let mergeShopByName = null;
let questPageBySlug = null;
let questPageByName = null;
let locationBySlug = null;
let baseNameCache = new Map();

// --- Utilities ---

/** @param {string} str @returns {string} HTML-escaped string. */
function escapeHtml(str) {
    _escapeEl.textContent = str;
    return _escapeEl.innerHTML;
}

/** Strip wiki tag suffixes; results are memoized. */
function getBaseName(itemName) {
    let cached = baseNameCache.get(itemName);
    if (cached !== undefined) return cached;
    cached = itemName.replace(
        /\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Legend|Non-Legend|Merge|Rare|VIP|Monster)\)/gi,
        ""
    ).trim();
    baseNameCache.set(itemName, cached);
    return cached;
}

function wikiUrl(slug) {
    if (!slug) return "http://aqwwiki.wikidot.com";
    if (slug.startsWith("http://") || slug.startsWith("https://")) return slug;
    return "http://aqwwiki.wikidot.com" + (slug.startsWith("/") ? slug : "/" + slug);
}

function extractProperty(arr, prop) {
    if (!Array.isArray(arr)) return null;
    for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (Array.isArray(item) && item[0] === prop) return item[1];
    }
    return null;
}

function matchSearch(parts) {
    if (!searchTerm) return true;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] && parts[i].toLowerCase().includes(searchTerm)) return true;
    }
    return false;
}

function getItemTags(itemData) {
    const tags = [];
    let hasAc = false, hasLegend = false;
    for (let i = 0; i < itemData.length; i++) {
        const entry = itemData[i];
        if (!Array.isArray(entry)) continue;
        switch (entry[0]) {
            case "AC": if (entry[1]) { tags.push("ac"); hasAc = true; } break;
            case "Legend": if (entry[1]) { tags.push("legend"); hasLegend = true; } break;
            case "Seasonal": if (entry[1]) tags.push("seasonal"); break;
            case "Rare": if (entry[1]) tags.push("rare"); break;
            case "Pseudo Rare": if (entry[1]) tags.push("pseudo_rare"); break;
        }
    }
    if (!hasAc && !hasLegend) tags.push("normal");
    return tags;
}

function getDropRateTier(itemName, itemData) {
    const baseName = getBaseName(itemName);
    if (dropRatesData && dropRatesData.items && dropRatesData.items[baseName]) {
        const entry = dropRatesData.items[baseName];
        // New format: entry is an object { tier, rate, note }
        if (typeof entry === "object" && entry.tier) {
            const tierLabel = (dropRatesData._meta && dropRatesData._meta.tiers && dropRatesData._meta.tiers[entry.tier]) || entry.tier;
            return {
                tier: entry.tier,
                label: tierLabel,
                rate: entry.rate || null,
                note: entry.note || null
            };
        }
        // Legacy format: entry is a plain tier string (e.g., "vr")
        if (typeof entry === "string" && dropRatesData._meta && dropRatesData._meta.tiers && dropRatesData._meta.tiers[entry]) {
            return { tier: entry, label: dropRatesData._meta.tiers[entry] };
        }
    }
    // Heuristic fallback
    if (!itemData) return { tier: "m", label: "Moderate (10–20%)" };
    
    const tags = getItemTags(itemData);
    
    if (tags.includes("ac")) return { tier: "r", label: "Rare (2–5%)" };
    if (tags.includes("legend")) return { tier: "u", label: "Uncommon (5–10%)" };
    
    return { tier: "c", label: "Common (20–35%)" };
}

/** Cached filter state -- call snapshotFilters() once before a build loop. */
let _filters = { normal: true, ac: true, legend: true, seasonal: true };
let _bankFilters = { rare: false, pseudoRare: false };

function snapshotFilters() {
    _filters = {
        normal: document.getElementById("filter-normal")?.checked ?? true,
        ac: document.getElementById("filter-ac")?.checked ?? true,
        legend: document.getElementById("filter-legend")?.checked ?? true,
        seasonal: document.getElementById("filter-seasonal")?.checked ?? true
    };
    _bankFilters = {
        rare: document.getElementById("filter-rare")?.checked ?? false,
        pseudoRare: document.getElementById("filter-pseudo-rare")?.checked ?? false
    };
}

function getFilters() { return _filters; }
function getBankFilters() { return _bankFilters; }

function passesTagFilter(tags) {
    for (let i = 0; i < tags.length; i++) {
        switch (tags[i]) {
            case "normal": if (!_filters.normal) return false; break;
            case "ac": if (!_filters.ac) return false; break;
            case "legend": if (!_filters.legend) return false; break;
            case "seasonal": if (!_filters.seasonal) return false; break;
        }
    }
    return true;
}

function buildCacheKey(tab) {
    let key = `${_filters.normal}|${_filters.ac}|${_filters.legend}|${_filters.seasonal}|${searchTerm}`;
    if (tab === "inbank") key += `|${_bankFilters.rare}|${_bankFilters.pseudoRare}`;
    return key;
}

function isOwned(name) {
    return accountItemSet.has(getBaseName(name));
}

function getOwnershipBadge(name) {
    const baseName = getBaseName(name);
    const items = accountByName[baseName];
    if (!items || items.length === 0) return "";
    for (let i = 0; i < items.length; i++) {
        const loc = items[i].location;
        if (loc === "Inv" || (loc && loc.toLowerCase() === "inventory")) return "In Inv";
    }
    for (let i = 0; i < items.length; i++) {
        if (items[i].location && items[i].location.toLowerCase().includes("bank")) return "In Bank";
    }
    return "Owned";
}

function getOwnedAmount(name) {
    const baseName = getBaseName(name);
    const items = accountByName[baseName];
    if (!items) return 0;
    let sum = 0;
    for (let i = 0; i < items.length; i++) sum += (parseInt(items[i].quantity, 10) || 1);
    return sum;
}

function applyGridSize(size) {
    const config = GRID_SIZE_CONFIG[size] || GRID_SIZE_CONFIG.medium;
    document.documentElement.style.setProperty("--item-grid-min", config.item);
    document.documentElement.style.setProperty("--group-grid-min", config.group);
}

function updateStats(left, right) {
    const leftEl = document.getElementById("stats-left");
    const rightEl = document.getElementById("stats-right");
    if (leftEl) leftEl.innerHTML = `<i class="fa-solid fa-bag-shopping"></i> Account: <strong>${left}</strong>`;
    if (rightEl) rightEl.innerHTML = `<i class="fa-solid fa-eye"></i> Showing: <strong>${right}</strong>`;
}

// --- Loading UI ---

function showLoading(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading...</div>
        </div>
    `;
}

// --- Lazy Image Loading (IntersectionObserver) ---

function initLazyImageObserver() {
    if (lazyImageObserver) return;
    lazyImageObserver = new IntersectionObserver((entries) => {
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (!entry.isIntersecting) continue;
            const img = entry.target;
            const slug = img.dataset.slug;
            if (slug && img.dataset.state === "pending") {
                img.dataset.state = "loading";
                loadCardImage(img, slug);
            }
            lazyImageObserver.unobserve(img);
        }
    }, { rootMargin: "200px" });
}

function observeCardImage(img, slug) {
    img.dataset.slug = slug;
    img.dataset.state = slug ? "pending" : "error";
    img.src = MISSING_IMAGE;
    if (slug && lazyImageObserver) lazyImageObserver.observe(img);
}

// --- Image Fetching ---

async function fetchItemImage(slug) {
    if (!slug) return MISSING_IMAGE;
    const url = wikiUrl(slug);
    if (imageCache.has(url)) return imageCache.get(url);

    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "fetchWikiHTML", url }, resolve);
        });

        if (!response || !response.success) {
            imageCache.set(url, MISSING_IMAGE);
            return MISSING_IMAGE;
        }

        const doc = new DOMParser().parseFromString(response.html, "text/html");
        const imgMale = doc.querySelector("#wiki-tab-0-0 img");
        const imgFemale = doc.querySelector("#wiki-tab-0-1 img");
        const images = [];

        if (imgMale && isValidItemImage(imgMale.src)) images.push(imgMale.src);
        if (imgFemale && isValidItemImage(imgFemale.src)) images.push(imgFemale.src);

        if (images.length === 0) {
            const allImgs = doc.querySelectorAll("#page-content img");
            for (const img of allImgs) {
                if (isValidItemImage(img.src)) { images.push(img.src); break; }
            }
        }

        const result = images.length > 0 ? images : [MISSING_IMAGE];
        imageCache.set(url, result);
        return result;
    } catch {
        imageCache.set(url, [MISSING_IMAGE]);
        return [MISSING_IMAGE];
    }
}

function isValidItemImage(src) {
    if (!src) return false;
    const lower = src.toLowerCase();
    return !lower.includes("/image-tags/") && !lower.includes("acsmall")
        && !lower.includes("aclarge") && !lower.includes("raresmall")
        && !lower.includes("legendsmall") && !lower.includes("membersmall")
        && !lower.includes("pseudosmall") && !lower.includes("seasonalsmall");
}

// --- Source Detail Lookup ---

function buildMonsterLocationIndex() {
    monsterLocationIndex = new Map();
    if (!locationsData) return;
    for (const loc of Object.values(locationsData)) {
        if (!loc.monsters) continue;
        for (const m of loc.monsters) {
            const key = m.name.toLowerCase();
            let arr = monsterLocationIndex.get(key);
            if (!arr) { arr = []; monsterLocationIndex.set(key, arr); }
            arr.push({ locationName: loc.name, joinCmd: loc.join_cmd || null, count: m.count || 0 });
        }
    }
}

function buildSourceLookupIndexes() {
    mergeShopBySlug = new Map();
    mergeShopByName = new Map();
    if (mergeShopsData) {
        for (const shop of Object.values(mergeShopsData)) {
            if (shop.slug) mergeShopBySlug.set(shop.slug, shop);
            if (shop.name) mergeShopByName.set(shop.name, shop);
        }
    }

    questPageBySlug = new Map();
    questPageByName = new Map();
    if (questsData) {
        for (const page of Object.values(questsData)) {
            if (page.slug) questPageBySlug.set(page.slug, page);
            if (page.name) questPageByName.set(page.name, page);
        }
    }

    locationBySlug = new Map();
    if (locationsData) {
        for (const loc of Object.values(locationsData)) {
            if (loc.slug) locationBySlug.set(loc.slug, loc);
        }
    }
}

function lookupSourceDetails(type, name, slug) {
    const lines = [];

    if (type === "Drop" && name) {
        const locs = monsterLocationIndex?.get(name.toLowerCase());
        if (locs && locs.length > 0) {
            const limit = Math.min(locs.length, 3);
            for (let i = 0; i < limit; i++) {
                const loc = locs[i];
                let line = loc.locationName;
                if (loc.joinCmd) line += `  \u2192  ${loc.joinCmd}`;
                if (loc.count > 0) line += ` (x${loc.count})`;
                lines.push(line);
            }
            if (locs.length > 3) lines.push(`+ ${locs.length - 3} more locations`);
        }
    }

    if (type === "Merge") {
        const shop = (slug && mergeShopBySlug?.get(slug)) || mergeShopByName?.get(name);
        if (shop) {
            if (shop.npc?.name) lines.push(`NPC: ${shop.npc.name}`);
            if (shop.location?.name) {
                let line = shop.location.name;
                const loc = shop.location.slug && locationBySlug?.get(shop.location.slug);
                if (loc?.join_cmd) line += `  \u2192  ${loc.join_cmd}`;
                lines.push(line);
            }
        }
    }

    if (type === "Quest") {
        const page = (slug && questPageBySlug?.get(slug)) || questPageByName?.get(name);
        if (page) {
            if (page.npc?.name) lines.push(`NPC: ${page.npc.name}`);
            if (page.location?.name) {
                let line = page.location.name;
                const loc = page.location.slug && locationBySlug?.get(page.location.slug);
                if (loc?.join_cmd) line += `  \u2192  ${loc.join_cmd}`;
                lines.push(line);
            }
        }
    }

    return { lines };
}

// --- Source Tooltip UI ---

let tooltipHideTimer = null;
const _tooltipEl = () => document.getElementById("source-tooltip");

let activeTooltipId = 0;

function showSourceTooltip(chipEl, type, name, slug) {
    const tooltip = _tooltipEl();
    if (!tooltip) return;
    clearTimeout(tooltipHideTimer);

    const details = lookupSourceDetails(type, name, slug);
    if (details.lines.length === 0 && !slug) { tooltip.hidden = true; return; }

    const thisId = ++activeTooltipId;

    tooltip.innerHTML = "";

    if (type === "Drop" && slug) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "source-tooltip-img-wrap";

        const img = document.createElement("img");
        img.className = "source-tooltip-img";
        img.alt = name;
        img.src = MISSING_IMAGE;
        img.dataset.state = "loading";
        imgWrap.appendChild(img);
        tooltip.appendChild(imgWrap);

        fetchItemImage(slug).then(result => {
            if (activeTooltipId !== thisId) return;
            const src = Array.isArray(result) ? result[0] : result;
            if (src && src !== MISSING_IMAGE) {
                img.src = src;
                img.dataset.state = "loaded";
            } else {
                img.dataset.state = "error";
            }
            positionTooltip(tooltip, chipEl);
        }).catch(() => { img.dataset.state = "error"; });
    }

    const header = document.createElement("div");
    header.className = "source-tooltip-header";
    header.textContent = name;
    tooltip.appendChild(header);

    if (type === "Drop") {
        const typeLabel = document.createElement("div");
        typeLabel.className = "source-tooltip-type";
        typeLabel.innerHTML = `<i class="fa-solid ${FA_ICONS.drop}"></i> Monster Drop`;
        tooltip.appendChild(typeLabel);
        
        if (name) { // name here is the drop source or item? Wait, showSourceTooltip takes type, name, slug. For Drop, name is the source (monster name), not the item name. 
            // Hmm, I can't look up item rate by monster name. I should pass the item name or rate info in the chip.
            // Let's hold off on this tooltip modification or pass item name.
        }
    } else if (type === "Merge") {
        const typeLabel = document.createElement("div");
        typeLabel.className = "source-tooltip-type";
        typeLabel.innerHTML = `<i class="fa-solid ${FA_ICONS.merge}"></i> Merge Shop`;
        tooltip.appendChild(typeLabel);
    } else if (type === "Quest") {
        const typeLabel = document.createElement("div");
        typeLabel.className = "source-tooltip-type";
        typeLabel.innerHTML = `<i class="fa-solid ${FA_ICONS.quest}"></i> Quest Reward`;
        tooltip.appendChild(typeLabel);
    }

    for (let i = 0; i < details.lines.length; i++) {
        const row = document.createElement("div");
        row.className = "source-tooltip-row";
        row.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${escapeHtml(details.lines[i])}`;
        tooltip.appendChild(row);
    }

    if (slug) {
        const link = document.createElement("div");
        link.className = "source-tooltip-link";
        link.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Wiki Page`;
        tooltip.appendChild(link);
    }

    tooltip.hidden = false;
    positionTooltip(tooltip, chipEl);
}

function positionTooltip(tooltip, chipEl) {
    const rect = chipEl.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let top = rect.bottom + 8;
    let left = rect.left + (rect.width / 2) - (tw / 2);

    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    if (top + th > window.innerHeight - 8) top = rect.top - th - 8;

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
}

function hideSourceTooltip() {
    tooltipHideTimer = setTimeout(() => {
        const tooltip = _tooltipEl();
        if (tooltip) tooltip.hidden = true;
    }, 120);
}

// --- Chip Rendering ---

function createChip(iconKey, label, cls, sourceData) {
    const chip = document.createElement("span");
    chip.className = "chip " + cls;

    if (iconKey && FA_ICONS[iconKey]) {
        const icon = document.createElement("i");
        icon.className = "fa-solid " + FA_ICONS[iconKey];
        chip.appendChild(icon);
        chip.appendChild(document.createTextNode(" " + label));
    } else {
        chip.textContent = label;
    }

    if (sourceData && sourceData.type) {
        chip.addEventListener("mouseenter", () => showSourceTooltip(chip, sourceData.type, sourceData.name, sourceData.slug));
        chip.addEventListener("mouseleave", hideSourceTooltip);
        chip.style.cursor = "help";
    }

    return chip;
}

// --- Card Rendering ---

async function loadCardImage(imgEl, slug) {
    if (!slug) { imgEl.src = MISSING_IMAGE; imgEl.dataset.state = "error"; return; }
    try {
        const result = await fetchItemImage(slug);
        const src = Array.isArray(result) ? result[0] : result;
        imgEl.src = src || MISSING_IMAGE;
        imgEl.dataset.state = src && src !== MISSING_IMAGE ? "loaded" : "error";
    } catch {
        imgEl.src = MISSING_IMAGE;
        imgEl.dataset.state = "error";
    }
}

function renderItemCard(name, data, options = {}) {
    const slug = data[0] || "";
    const tags = getItemTags(data);
    const badge = options.badge || getOwnershipBadge(name);
    const priceData = extractProperty(data, "Price");

    const card = document.createElement("div");
    card.className = "item-card";
    card.dataset.name = name;
    card.dataset.slug = slug;

    if (tags.includes("ac")) card.dataset.rarity = "ac";
    else if (tags.includes("legend")) card.dataset.rarity = "legend";
    else if (tags.includes("seasonal")) card.dataset.rarity = "seasonal";
    else if (tags.includes("rare") || tags.includes("pseudo_rare")) card.dataset.rarity = "rare";

    const imgWrap = document.createElement("div");
    imgWrap.className = "card-image-wrap";

    const gallery = document.createElement("div");
    gallery.className = "card-image-gallery";

    const img = document.createElement("img");
    img.className = "card-img";
    img.alt = name;
    observeCardImage(img, slug);
    gallery.appendChild(img);
    imgWrap.appendChild(gallery);

    const tagStack = document.createElement("div");
    tagStack.className = "card-tag-stack";

    if (badge) {
        const stateBadge = document.createElement("span");
        stateBadge.className = "card-state-badge " + (badge === "In Bank" ? "bank" : badge === "In Inv" ? "inv" : "needed");
        stateBadge.textContent = badge;
        tagStack.appendChild(stateBadge);
    }

    if (tags.includes("rare")) {
        const rareTag = document.createElement("span");
        rareTag.className = "card-tag-label rare";
        rareTag.textContent = "RARE";
        tagStack.appendChild(rareTag);
    }

    if (tags.includes("pseudo_rare")) {
        const prTag = document.createElement("span");
        prTag.className = "card-tag-label pseudo-rare";
        prTag.textContent = "PSEUDO RARE";
        tagStack.appendChild(prTag);
    }

    imgWrap.appendChild(tagStack);
    card.appendChild(imgWrap);

    const body = document.createElement("div");
    body.className = "card-body";

    const nameEl = document.createElement("div");
    nameEl.className = "card-name";
    nameEl.textContent = name;
    body.appendChild(nameEl);

    const meta = document.createElement("div");
    meta.className = "card-meta";

    if (tags.includes("ac")) meta.appendChild(createChip("ac", "AC", "ac"));
    if (tags.includes("legend")) meta.appendChild(createChip("legend", "Legend", "legend"));
    if (tags.includes("seasonal")) meta.appendChild(createChip("seasonal", "Seasonal", "seasonal"));

    if (priceData && Array.isArray(priceData)) {
        const sourceType = priceData[0];
        const sourceName = priceData[1] || "";
        const sourceSlug = priceData[2] || "";
        const sd = { type: sourceType, name: sourceName, slug: sourceSlug, itemName: name };
        if (sourceType === "Drop") {
            meta.appendChild(createChip("drop", sourceName, "source", sd));
            const rate = getDropRateTier(name, data);
            const rateLabel = rate.rate || rate.label.split(" ")[0];
            const rateChip = createChip("", rateLabel, `rate-tier drop-rate-${rate.tier}`);
            if (rate.note) rateChip.title = rate.note;
            meta.appendChild(rateChip);
        }
        else if (sourceType === "Merge") meta.appendChild(createChip("merge", sourceName, "source", sd));
        else if (sourceType === "Quest") meta.appendChild(createChip("quest", sourceName, "source", sd));
        else if (sourceType === "AC" || sourceType === "GOLD") meta.appendChild(createChip("shop", sourceType + " " + sourceName, "source"));
    }

    body.appendChild(meta);
    card.appendChild(body);
    card.addEventListener("click", () => openItemModal(name, data));
    return card;
}

// --- Tab: To Drop ---

function buildToDropItems() {
    snapshotFilters();
    const key = buildCacheKey("todrop");
    if (buildCache.todrop.key === key && buildCache.todrop.items) return buildCache.todrop.items;

    const items = [];
    const seen = new Set();

    for (const [name, data] of Object.entries(wikiData)) {
        const baseName = getBaseName(name);
        if (seen.has(baseName) || accountItemSet.has(baseName)) continue;

        const tags = getItemTags(data);
        if (tags.includes("rare") || !passesTagFilter(tags)) continue;

        const priceData = extractProperty(data, "Price");
        if (!Array.isArray(priceData) || priceData[0] !== "Drop") continue;
        if (!matchSearch([name, priceData[1] || ""])) continue;

        seen.add(baseName);
        items.push([name, data]);
    }

    buildCache.todrop = { key, items };
    return items;
}

function renderToDropTab() {
    tabState.todrop.items = buildToDropItems();
    tabState.todrop.page = 0;
    renderToDropPage();
}

function renderToDropPage() {
    const state = tabState.todrop;
    const grid = document.getElementById("todrop-grid");
    const paginationEl = document.getElementById("todrop-pagination");
    if (!grid) return;

    grid.innerHTML = "";
    const start = state.page * ITEMS_PER_PAGE;
    const batch = state.items.slice(start, start + ITEMS_PER_PAGE);

    if (batch.length === 0) {
        grid.innerHTML = renderEmptyState("fa-skull-crossbones", "No Drop Items", "No drop items match your current filters and search.");
        paginationEl.innerHTML = "";
        updateStats(accountItems.length, 0);
        return;
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < batch.length; i++) frag.appendChild(renderItemCard(batch[i][0], batch[i][1]));
    grid.appendChild(frag);

    renderPagination(paginationEl, state, state.items.length, renderToDropPage);
    updateStats(accountItems.length, state.items.length);
}

// --- Tab: To Merge ---

function buildToMergeGroups() {
    if (!mergeShopsData) return [];

    snapshotFilters();
    const key = buildCacheKey("tomerge");
    if (buildCache.tomerge.key === key && buildCache.tomerge.groups) return buildCache.tomerge.groups;

    const groups = [];

    for (const [shopName, shopData] of Object.entries(mergeShopsData)) {
        if (!shopData || !shopData.tabs || shopData.rare) continue;

        const allItems = shopData.tabs.flatMap(tab => tab.items || []);
        if (allItems.length === 0) continue;

        const unownedItems = [];
        let ownedCount = 0;

        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            const itemTags = item.tags || [];
            const filterTags = [];
            if (itemTags.includes("ac")) filterTags.push("ac");
            if (itemTags.includes("legend")) filterTags.push("legend");
            if (itemTags.includes("seasonal")) filterTags.push("seasonal");
            if (filterTags.length === 0) filterTags.push("normal");

            if (!passesTagFilter(filterTags)) continue;

            if (isOwned(item.name || "")) { ownedCount++; }
            else if (matchSearch([item.name || "", shopName, shopData.name || ""])) {
                unownedItems.push(item);
            }
        }

        if (unownedItems.length === 0 && !matchSearch([shopName, shopData.name || ""])) continue;

        groups.push({
            name: shopData.name || shopName,
            slug: shopData.slug || "",
            location: shopData.location || null,
            npc: shopData.npc || null,
            items: unownedItems,
            ownedCount,
            totalItems: allItems.length
        });
    }

    groups.sort((a, b) => {
        const pctA = a.totalItems > 0 ? a.ownedCount / a.totalItems : 0;
        const pctB = b.totalItems > 0 ? b.ownedCount / b.totalItems : 0;
        return pctA - pctB;
    });

    buildCache.tomerge = { key, groups };
    return groups;
}

function renderToMergeTab() {
    tabState.tomerge.groups = buildToMergeGroups();
    tabState.tomerge.page = 0;
    renderToMergePage();
}

function renderToMergePage() {
    const state = tabState.tomerge;
    const wrap = document.getElementById("tomerge-wrap");
    const paginationEl = document.getElementById("tomerge-pagination");
    if (!wrap) return;

    wrap.innerHTML = "";
    const start = state.page * GROUPS_PER_PAGE;
    const batch = state.groups.slice(start, start + GROUPS_PER_PAGE);

    if (batch.length === 0) {
        wrap.innerHTML = renderEmptyState("fa-object-group", "No Merge Shops", "No merge shop items match your filters.");
        paginationEl.innerHTML = "";
        updateStats(accountItems.length, 0);
        return;
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < batch.length; i++) frag.appendChild(renderMergeGroupCard(batch[i]));
    wrap.appendChild(frag);

    renderPagination(paginationEl, state, state.groups.length, renderToMergePage, GROUPS_PER_PAGE);
    updateStats(accountItems.length, state.groups.length);
}

function renderMergeGroupCard(group) {
    const card = document.createElement("div");
    card.className = "group-card";

    const pct = group.totalItems > 0 ? Math.round((group.ownedCount / group.totalItems) * 100) : 0;

    let locationHtml = "";
    if (group.location && group.location.name) {
        locationHtml += `<span class="chip source" data-tt-type="Merge" data-tt-name="${escapeHtml(group.name)}" data-tt-slug="${escapeHtml(group.slug)}"><i class="fa-solid ${FA_ICONS.location}"></i> ${escapeHtml(group.location.name)}</span>`;
    }
    if (group.npc && group.npc.name) {
        locationHtml += `<span class="chip source"><i class="fa-solid ${FA_ICONS.npc}"></i> ${escapeHtml(group.npc.name)}</span>`;
    }

    card.innerHTML = `
        <div class="group-header">
            <div>
                <div class="group-title">
                    <a href="${escapeHtml(wikiUrl(group.slug))}" target="_blank" rel="noreferrer">${escapeHtml(group.name)}</a>
                </div>
                <div class="card-meta" style="margin-top:6px">${locationHtml}</div>
            </div>
            <div class="group-progress">
                <div class="progress-bar-wrap">
                    <div class="progress-bar-fill ${pct === 100 ? "complete" : ""}" style="width:${pct}%"></div>
                </div>
                <div class="progress-text">${group.ownedCount} / ${group.totalItems} owned (${pct}%)</div>
            </div>
        </div>
        <div class="group-items-grid"></div>
    `;

    wireTooltipListeners(card);

    const itemsGrid = card.querySelector(".group-items-grid");
    const limit = Math.min(group.items.length, 12);

    for (let i = 0; i < limit; i++) {
        const item = group.items[i];
        const itemData = resolveItemData(item.name);
        if (itemData) {
            itemsGrid.appendChild(renderItemCard(item.name, itemData, { badge: "Needed" }));
        } else {
            itemsGrid.appendChild(renderFallbackCard(item));
        }
    }

    if (group.items.length > 12) {
        const moreEl = document.createElement("div");
        moreEl.className = "empty-state";
        moreEl.style.padding = "16px";
        moreEl.innerHTML = `<span class="empty-state-copy">+ ${group.items.length - 12} more items</span>`;
        itemsGrid.appendChild(moreEl);
    }

    return card;
}

function renderFallbackCard(item) {
    const fallbackCard = document.createElement("div");
    fallbackCard.className = "item-card";
    fallbackCard.dataset.slug = item.slug || "";
    fallbackCard.innerHTML = `
        <div class="card-image-wrap">
            <div class="card-image-gallery">
                <img class="card-img" src="${MISSING_IMAGE}" alt="${escapeHtml(item.name)}" data-state="pending" data-slug="${escapeHtml(item.slug || "")}">
            </div>
            <div class="card-tag-stack"><span class="card-state-badge needed">Needed</span></div>
        </div>
        <div class="card-body">
            <div class="card-name">${escapeHtml(item.name)}</div>
            <div class="card-meta">
                <span class="chip source"><i class="fa-solid ${FA_ICONS.merge}"></i> Merge</span>
                ${(item.tags || []).includes("ac") ? `<span class="chip ac"><i class="fa-solid ${FA_ICONS.ac}"></i> AC</span>` : ""}
                ${(item.tags || []).includes("legend") ? `<span class="chip legend"><i class="fa-solid ${FA_ICONS.legend}"></i> Legend</span>` : ""}
            </div>
        </div>
    `;
    if (item.slug && lazyImageObserver) {
        const imgEl = fallbackCard.querySelector(".card-img");
        if (imgEl) lazyImageObserver.observe(imgEl);
    }
    return fallbackCard;
}

// --- Tab: To Quest ---

function buildToQuestGroups() {
    if (!questsData) return [];

    snapshotFilters();
    const key = buildCacheKey("toquest");
    if (buildCache.toquest.key === key && buildCache.toquest.groups) return buildCache.toquest.groups;

    const groups = [];

    for (const [pageName, pageData] of Object.entries(questsData)) {
        if (!pageData || !pageData.quests) continue;
        if ((pageData.tags || []).includes("_index") || pageData.rare) continue;

        const questGroup = {
            name: pageData.name || pageName,
            slug: pageData.slug || "",
            quests: [],
            location: pageData.location || null,
            npc: pageData.npc || null
        };

        for (let qi = 0; qi < pageData.quests.length; qi++) {
            const quest = pageData.quests[qi];
            const rewards = (quest.rewards && quest.rewards.items) || [];
            const unownedRewards = [];
            for (let ri = 0; ri < rewards.length; ri++) {
                if (!isOwned(rewards[ri].name)) unownedRewards.push(rewards[ri]);
            }
            if (unownedRewards.length === 0) continue;

            const tagSet = new Set();
            for (let ri = 0; ri < unownedRewards.length; ri++) {
                const rTags = unownedRewards[ri].tags;
                if (rTags) for (let ti = 0; ti < rTags.length; ti++) tagSet.add(rTags[ti]);
            }
            if (tagSet.size === 0) tagSet.add("normal");
            const tags = Array.from(tagSet);

            if (!passesTagFilter(tags)) continue;

            const searchParts = [quest.name || "", pageData.name || ""];
            for (let ri = 0; ri < unownedRewards.length; ri++) searchParts.push(unownedRewards[ri].name);
            if (!matchSearch(searchParts)) continue;

            questGroup.quests.push({
                name: quest.name || "Unknown Quest",
                requirements: quest.items_required || [],
                rewards: unownedRewards,
                requirementsNote: quest.requirements_note || ""
            });
        }

        if (questGroup.quests.length > 0) groups.push(questGroup);
    }

    buildCache.toquest = { key, groups };
    return groups;
}

function renderToQuestTab() {
    tabState.toquest.groups = buildToQuestGroups();
    tabState.toquest.page = 0;
    renderToQuestPage();
}

function renderToQuestPage() {
    const state = tabState.toquest;
    const wrap = document.getElementById("toquest-wrap");
    const paginationEl = document.getElementById("toquest-pagination");
    if (!wrap) return;

    wrap.innerHTML = "";
    const start = state.page * GROUPS_PER_PAGE;
    const batch = state.groups.slice(start, start + GROUPS_PER_PAGE);

    if (batch.length === 0) {
        wrap.innerHTML = renderEmptyState("fa-scroll", "No Quest Rewards", "No quest reward items match your filters.");
        paginationEl.innerHTML = "";
        updateStats(accountItems.length, 0);
        return;
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < batch.length; i++) frag.appendChild(renderQuestGroupCard(batch[i]));
    wrap.appendChild(frag);

    renderPagination(paginationEl, state, state.groups.length, renderToQuestPage, GROUPS_PER_PAGE);
    updateStats(accountItems.length, state.groups.length);
}

function renderQuestGroupCard(group) {
    const card = document.createElement("div");
    card.className = "group-card";

    let locationHtml = "";
    if (group.location) {
        locationHtml = `<span class="chip source" data-tt-type="Quest" data-tt-name="${escapeHtml(group.name)}" data-tt-slug="${escapeHtml(group.slug)}"><i class="fa-solid ${FA_ICONS.location}"></i> <a href="${escapeHtml(wikiUrl(group.location.slug))}" target="_blank">${escapeHtml(group.location.name)}</a></span>`;
    }

    card.innerHTML = `
        <div class="group-header">
            <div>
                <div class="group-title">
                    <a href="${escapeHtml(wikiUrl(group.slug))}" target="_blank" rel="noreferrer">${escapeHtml(group.name)}</a>
                </div>
                <div class="card-meta" style="margin-top:6px">${locationHtml}</div>
            </div>
        </div>
    `;

    wireTooltipListeners(card);

    for (let qi = 0; qi < group.quests.length; qi++) {
        const quest = group.quests[qi];
        const section = document.createElement("div");
        section.className = "quest-section";

        let reqHtml = "";
        if (quest.requirements && quest.requirements.length > 0) {
            const reqParts = [];
            for (let ri = 0; ri < quest.requirements.length; ri++) {
                const req = quest.requirements[ri];
                const owned = getOwnedAmount(req.name);
                const needed = parseInt(req.qty, 10) || 1;
                const metClass = owned >= needed ? " met" : "";
                reqParts.push(`
                    <div class="modal-req-item">
                        <span class="modal-req-main">${escapeHtml(req.name)}</span>
                        <div class="modal-req-extra">
                            <span class="modal-req-pill owned${metClass}">Owned ${owned}</span>
                            <span class="modal-req-pill need">Need ${needed}</span>
                        </div>
                    </div>
                `);
            }
            reqHtml = '<div class="modal-req-list">' + reqParts.join("") + "</div>";
        }

        section.innerHTML = `
            <div class="quest-section-header">
                <strong>${escapeHtml(quest.name)}</strong>
                <span class="chip source">${quest.rewards.length} reward${quest.rewards.length !== 1 ? "s" : ""}</span>
            </div>
            ${reqHtml}
            <div class="group-items-grid quest-rewards-grid"></div>
        `;

        const rewardsGrid = section.querySelector(".quest-rewards-grid");
        const limit = Math.min(quest.rewards.length, 8);
        for (let ri = 0; ri < limit; ri++) {
            const itemData = resolveItemData(quest.rewards[ri].name);
            if (itemData) rewardsGrid.appendChild(renderItemCard(quest.rewards[ri].name, itemData));
        }

        card.appendChild(section);
    }

    return card;
}

// --- Tab: In Bank ---

function buildInBankItems() {
    snapshotFilters();
    const key = buildCacheKey("inbank");
    if (buildCache.inbank.key === key && buildCache.inbank.items) return buildCache.inbank.items;

    const items = [];
    const seen = new Set();

    for (let i = 0; i < accountItems.length; i++) {
        const item = accountItems[i];
        if (!item.location || !item.location.toLowerCase().includes("bank")) continue;

        const baseName = getBaseName(item.name);
        if (seen.has(baseName)) continue;

        const itemData = resolveItemData(baseName) || resolveItemData(item.name);
        if (!itemData) continue;

        const tags = getItemTags(itemData);
        if (!passesTagFilter(tags)) continue;

        if (_bankFilters.rare || _bankFilters.pseudoRare) {
            const hasRare = tags.includes("rare");
            const hasPseudoRare = tags.includes("pseudo_rare");
            if (_bankFilters.rare && !hasRare && _bankFilters.pseudoRare && !hasPseudoRare) continue;
            if (_bankFilters.rare && !_bankFilters.pseudoRare && !hasRare) continue;
            if (!_bankFilters.rare && _bankFilters.pseudoRare && !hasPseudoRare) continue;
        }

        if (!matchSearch([baseName])) continue;

        seen.add(baseName);
        items.push([baseName, itemData]);
    }

    buildCache.inbank = { key, items };
    return items;
}

function renderInBankTab() {
    tabState.inbank.items = buildInBankItems();
    tabState.inbank.page = 0;
    renderInBankPage();
}

function renderInBankPage() {
    const state = tabState.inbank;
    const grid = document.getElementById("inbank-grid");
    const paginationEl = document.getElementById("inbank-pagination");
    if (!grid) return;

    grid.innerHTML = "";
    const start = state.page * ITEMS_PER_PAGE;
    const batch = state.items.slice(start, start + ITEMS_PER_PAGE);

    if (batch.length === 0) {
        grid.innerHTML = renderEmptyState("fa-vault", "No Bank Items", "No items in your bank match the current filters.");
        paginationEl.innerHTML = "";
        updateStats(accountItems.length, 0);
        return;
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < batch.length; i++) frag.appendChild(renderItemCard(batch[i][0], batch[i][1], { badge: "In Bank" }));
    grid.appendChild(frag);

    renderPagination(paginationEl, state, state.items.length, renderInBankPage);
    updateStats(accountItems.length, state.items.length);
}

// --- Tab: Completed ---

function buildCompletedStats() {
    snapshotFilters();
    const key = buildCacheKey("completed");
    if (buildCache.completed.key === key && buildCache.completed.stats) return buildCache.completed.stats;

    let totalItems = 0, ownedItems = 0;
    let totalAC = 0, ownedAC = 0;
    let totalSeasonal = 0, ownedSeasonal = 0;
    const seen = new Set();

    for (const [name, data] of Object.entries(wikiData)) {
        const baseName = getBaseName(name);
        if (seen.has(baseName)) continue;
        seen.add(baseName);

        const tags = getItemTags(data);
        if (tags.includes("rare")) continue;

        totalItems++;
        const owned = accountItemSet.has(baseName);
        if (owned) ownedItems++;
        if (tags.includes("ac")) { totalAC++; if (owned) ownedAC++; }
        if (tags.includes("seasonal")) { totalSeasonal++; if (owned) ownedSeasonal++; }
    }

    const stats = {
        total: { owned: ownedItems, total: totalItems },
        ac: { owned: ownedAC, total: totalAC },
        seasonal: { owned: ownedSeasonal, total: totalSeasonal }
    };

    buildCache.completed = { key, stats };
    return stats;
}

function renderCompletedTab() {
    const wrap = document.getElementById("completed-wrap");
    if (!wrap) return;

    const stats = buildCompletedStats();
    wrap.innerHTML = "";

    const summaryRow = document.createElement("div");
    summaryRow.className = "completed-summary-row";
    summaryRow.appendChild(renderSummaryCard("Overall Non-Rare", stats.total, ""));
    summaryRow.appendChild(renderSummaryCard("AC Items", stats.ac, "ac"));
    summaryRow.appendChild(renderSummaryCard("Seasonal Items", stats.seasonal, "seasonal"));
    wrap.appendChild(summaryRow);
    updateStats(accountItems.length, stats.total.owned);
}

function renderSummaryCard(title, data, cls) {
    const pct = data.total > 0 ? Math.round((data.owned / data.total) * 100) : 0;
    const card = document.createElement("div");
    card.className = "completed-summary-card";
    card.innerHTML = `
        <div class="summary-pie ${cls}" style="--pie-pct:${pct}%">
            <div class="summary-pie-center">${pct}%</div>
        </div>
        <div class="completed-summary-copy">
            <div class="completed-summary-title">${escapeHtml(title)}</div>
            <div class="completed-summary-primary">${data.owned.toLocaleString()} / ${data.total.toLocaleString()}</div>
            <div class="completed-summary-secondary">items collected</div>
        </div>
    `;
    return card;
}

// --- Item Detail Modal ---

async function openItemModal(name, data) {
    const overlay = document.getElementById("item-modal");
    if (!overlay) return;

    const slug = data[0] || "";
    const tags = getItemTags(data);
    const badge = getOwnershipBadge(name);
    const priceData = extractProperty(data, "Price");
    const category = data[data.length - 1] || "";

    document.getElementById("modal-title").textContent = name;

    const tagsEl = document.getElementById("modal-tags");
    tagsEl.innerHTML = "";
    if (badge) tagsEl.appendChild(createChip("", badge, badge === "In Bank" ? "ac" : "source"));
    if (tags.includes("ac")) tagsEl.appendChild(createChip("ac", "AC", "ac"));
    if (tags.includes("legend")) tagsEl.appendChild(createChip("legend", "Legend", "legend"));
    if (tags.includes("seasonal")) tagsEl.appendChild(createChip("seasonal", "Seasonal", "seasonal"));
    if (tags.includes("rare")) tagsEl.appendChild(createChip("rare", "Rare", "rare"));
    if (category) tagsEl.appendChild(createChip("type", category, "type"));

    const imgEl = document.getElementById("modal-image");
    imgEl.src = MISSING_IMAGE;
    imgEl.dataset.state = "loading";

    const descEl = document.getElementById("modal-description");
    const description = extractProperty(data, "Description");
    descEl.innerHTML = description
        ? `<div class="modal-label">Description</div><div class="modal-description-box">${escapeHtml(description)}</div>`
        : "";

    const priceEl = document.getElementById("modal-price");
    if (priceData && Array.isArray(priceData)) {
        let priceHtml = `<div class="modal-label">How to Get</div><div class="modal-value">`;

        if (priceData[0] === "Drop") {
            priceHtml += `<span class="chip source" data-tt-type="Drop" data-tt-item="${escapeHtml(name)}" data-tt-name="${escapeHtml(priceData[1] || "")}" data-tt-slug="${escapeHtml(priceData[2] || "")}"><i class="fa-solid ${FA_ICONS.drop}"></i> Drop</span> `;
            if (priceData[1]) {
                priceHtml += priceData[2]
                    ? `<a href="${escapeHtml(wikiUrl(priceData[2]))}" target="_blank">${escapeHtml(priceData[1])}</a>`
                    : `<strong>${escapeHtml(priceData[1])}</strong>`;
            }
            const rate = getDropRateTier(name, data);
            const rateLabel = rate.rate ? `${rate.rate} — ${rate.label}` : rate.label;
            const rateTitle = rate.note ? ` title="${escapeHtml(rate.note)}"` : "";
            priceHtml += ` <span class="chip drop-rate-${rate.tier}"${rateTitle}>${rateLabel}</span>`;
        } else if (priceData[0] === "Merge") {
            priceHtml += `<span class="chip source" data-tt-type="Merge" data-tt-name="${escapeHtml(priceData[1] || "")}" data-tt-slug="${escapeHtml(priceData[2] || "")}"><i class="fa-solid ${FA_ICONS.merge}"></i> Merge</span> `;
            if (priceData[1]) priceHtml += `<a href="${escapeHtml(wikiUrl(priceData[2] || ""))}" target="_blank">${escapeHtml(priceData[1])}</a>`;
        } else if (priceData[0] === "Quest") {
            priceHtml += `<span class="chip source" data-tt-type="Quest" data-tt-name="${escapeHtml(priceData[1] || "")}" data-tt-slug="${escapeHtml(priceData[2] || "")}"><i class="fa-solid ${FA_ICONS.quest}"></i> Quest</span> `;
            if (priceData[1]) priceHtml += `<a href="${escapeHtml(wikiUrl(priceData[2] || ""))}" target="_blank">${escapeHtml(priceData[1])}</a>`;
        } else if (priceData[0] === "AC" || priceData[0] === "GOLD") {
            priceHtml += `<span class="chip source"><i class="fa-solid ${FA_ICONS.shop}"></i> ${escapeHtml(priceData[0])}</span> ${escapeHtml(String(priceData[1] || ""))}`;
        } else {
            priceHtml += escapeHtml(priceData[0] + " " + (priceData[1] || ""));
        }

        priceHtml += "</div>";

        if (priceData[0] === "Merge" && priceData.length >= 4 && Array.isArray(priceData[3])) {
            priceHtml += '<div class="modal-req-list" style="margin-top:8px">';
            for (let mi = 0; mi < priceData[3].length; mi++) {
                const mat = priceData[3][mi];
                if (Array.isArray(mat) && mat.length >= 3) {
                    const owned = getOwnedAmount(mat[0]);
                    const needed = parseInt(mat[2], 10) || 1;
                    const metClass = owned >= needed ? " met" : "";
                    priceHtml += `
                        <a class="modal-req-item" href="${escapeHtml(wikiUrl(mat[1]))}" target="_blank">
                            <span class="modal-req-main">${escapeHtml(mat[0])}</span>
                            <div class="modal-req-extra">
                                <span class="modal-req-pill owned${metClass}">Owned ${owned}</span>
                                <span class="modal-req-pill need">Need ${needed}</span>
                            </div>
                        </a>
                    `;
                }
            }
            priceHtml += "</div>";
        }

        priceEl.innerHTML = priceHtml;
        wireTooltipListeners(priceEl);
    } else {
        priceEl.innerHTML = "";
    }

    document.getElementById("modal-location").innerHTML = "";
    document.getElementById("modal-requirements").innerHTML = "";

    const flagsEl = document.getElementById("modal-flags");
    let flagsHtml = "";
    if (extractProperty(data, "Rare")) flagsHtml += `<span class="chip rare"><i class="fa-solid ${FA_ICONS.rare}"></i> Rare</span> `;
    if (extractProperty(data, "Pseudo Rare")) flagsHtml += `<span class="chip legend"><i class="fa-solid ${FA_ICONS.pseudo}"></i> Pseudo Rare</span> `;
    if (extractProperty(data, "Seasonal")) flagsHtml += `<span class="chip seasonal"><i class="fa-solid ${FA_ICONS.seasonal}"></i> Seasonal</span> `;
    flagsEl.innerHTML = flagsHtml
        ? `<div class="modal-label">Flags</div><div class="modal-value">${flagsHtml}</div>`
        : "";

    document.getElementById("modal-slug").textContent = slug || "";
    document.getElementById("modal-wiki-link").href = wikiUrl(slug);

    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    try {
        const images = await fetchItemImage(slug);
        const imgSrc = Array.isArray(images) ? images[0] : images;
        imgEl.src = imgSrc || MISSING_IMAGE;
        imgEl.dataset.state = imgSrc && imgSrc !== MISSING_IMAGE ? "loaded" : "error";

        const tabsEl = document.getElementById("modal-image-tabs");
        if (Array.isArray(images) && images.length > 1 && images[0] !== MISSING_IMAGE) {
            tabsEl.hidden = false;
            tabsEl.innerHTML = "";
            images.forEach((src, i) => {
                const btn = document.createElement("button");
                btn.className = "modal-image-tab" + (i === 0 ? " active" : "");
                btn.textContent = i === 0 ? "Male" : "Female";
                btn.addEventListener("click", () => {
                    imgEl.src = src;
                    tabsEl.querySelectorAll(".modal-image-tab").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                });
                tabsEl.appendChild(btn);
            });
        } else {
            tabsEl.hidden = true;
        }
    } catch {
        imgEl.dataset.state = "error";
    }
}

function closeItemModal() {
    const overlay = document.getElementById("item-modal");
    if (overlay) { overlay.classList.remove("active"); document.body.style.overflow = ""; }
}

// --- Shared Tooltip Wiring ---

function wireTooltipListeners(container) {
    const els = container.querySelectorAll("[data-tt-type]");
    for (let i = 0; i < els.length; i++) {
        const el = els[i];
        el.addEventListener("mouseenter", () => showSourceTooltip(el, el.dataset.ttType, el.dataset.ttName, el.dataset.ttSlug));
        el.addEventListener("mouseleave", hideSourceTooltip);
        el.style.cursor = "help";
    }
}

// --- Pagination ---

function renderPagination(container, state, totalItems, renderFn, perPage = ITEMS_PER_PAGE) {
    container.innerHTML = "";
    const totalPages = Math.ceil(totalItems / perPage);
    if (totalPages <= 1) return;

    const prevBtn = document.createElement("button");
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i> Prev';
    prevBtn.disabled = state.page === 0;
    prevBtn.addEventListener("click", () => {
        state.page = Math.max(0, state.page - 1);
        renderFn();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const info = document.createElement("span");
    info.className = "page-info";
    info.textContent = `Page ${state.page + 1} of ${totalPages}`;

    const nextBtn = document.createElement("button");
    nextBtn.innerHTML = 'Next <i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = state.page >= totalPages - 1;
    nextBtn.addEventListener("click", () => {
        state.page = Math.min(totalPages - 1, state.page + 1);
        renderFn();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    container.appendChild(prevBtn);
    container.appendChild(info);
    container.appendChild(nextBtn);
}

// --- Empty State ---

function renderEmptyState(icon, title, text) {
    return `
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="empty-state-title">${escapeHtml(title)}</div>
            <div class="empty-state-copy">${escapeHtml(text)}</div>
        </div>
    `;
}

// --- Data Resolution ---

function buildWikiDataIndex() {
    wikiDataLowerIndex = new Map();
    if (!wikiData) return;
    for (const [key, val] of Object.entries(wikiData)) {
        const lower = getBaseName(key).toLowerCase();
        if (!wikiDataLowerIndex.has(lower)) wikiDataLowerIndex.set(lower, val);
    }
}

function resolveItemData(name) {
    if (!wikiData) return null;
    if (wikiData[name]) return wikiData[name];
    const baseName = getBaseName(name);
    if (wikiData[baseName]) return wikiData[baseName];
    return wikiDataLowerIndex?.get(baseName.toLowerCase()) || null;
}

// --- Tab Switching ---

function switchTab(tabName) {
    activeTab = tabName;

    const tabs = document.querySelectorAll(".tab-link");
    for (let i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].dataset.tab === tabName);

    const contents = document.querySelectorAll(".tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].classList.toggle("active", contents[i].id === "tab-" + tabName);

    const bankFilters = document.querySelectorAll(".bank-filter");
    for (let i = 0; i < bankFilters.length; i++) bankFilters[i].hidden = tabName !== "inbank";

    renderActiveTab();
}

let renderPending = 0;

function renderActiveTab() {
    const id = ++renderPending;

    requestAnimationFrame(() => {
        if (id !== renderPending) return;

        switch (activeTab) {
            case "todrop": renderToDropTab(); break;
            case "tomerge": renderToMergeTab(); break;
            case "toquest": renderToQuestTab(); break;
            case "inbank": renderInBankTab(); break;
            case "completed": renderCompletedTab(); break;
        }
    });
}

function invalidateBuildCache() {
    for (const k of Object.keys(buildCache)) buildCache[k].key = "";
}

// --- Data Loading ---

async function loadAllData() {
    try {
        const [wikiRes, mergeRes, questRes, locRes, dropRatesRes] = await Promise.all([
            fetch(chrome.runtime.getURL("data/WikiItems.json")).then(r => r.json()),
            fetch(chrome.runtime.getURL("data/merge_shops.json")).then(r => r.json()).catch(() => null),
            fetch(chrome.runtime.getURL("data/quests.json")).then(r => r.json()).catch(() => null),
            fetch(chrome.runtime.getURL("data/locations.json")).then(r => r.json()).catch(() => null),
            fetch(chrome.runtime.getURL("data/drop_rates.json")).then(r => r.json()).catch(() => null)
        ]);

        wikiData = wikiRes;
        mergeShopsData = mergeRes;
        questsData = questRes;
        locationsData = locRes;
        dropRatesData = dropRatesRes;

        buildWikiDataIndex();
        buildMonsterLocationIndex();
        buildSourceLookupIndexes();

        chrome.storage.local.get(["savedInventory"], (result) => {
            accountItems = result.savedInventory || [];
            accountItemSet = new Set(accountItems.map(item => getBaseName(item.name)));

            accountByName = {};
            for (let i = 0; i < accountItems.length; i++) {
                const baseName = getBaseName(accountItems[i].name);
                if (!accountByName[baseName]) accountByName[baseName] = [];
                accountByName[baseName].push(accountItems[i]);
            }

            document.body.classList.remove("is-loading");
            document.body.classList.add("is-loaded");
            invalidateBuildCache();
            renderActiveTab();
        });

    } catch (error) {
        console.error("Error loading Farm Tracker data:", error);
        document.body.classList.remove("is-loading");
    }
}

// --- Event Listeners ---

document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("is-loading");
    initLazyImageObserver();

    const tabBtns = document.querySelectorAll(".tab-link");
    for (let i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener("click", () => switchTab(tabBtns[i].dataset.tab));
    }

    const filterInputs = document.querySelectorAll(".filter-pill input");
    for (let i = 0; i < filterInputs.length; i++) {
        filterInputs[i].addEventListener("change", () => {
            clearTimeout(filterTimer);
            filterTimer = setTimeout(renderActiveTab, 150);
        });
    }

    const gridSelect = document.getElementById("grid-size-select");
    if (gridSelect) gridSelect.addEventListener("change", (e) => applyGridSize(e.target.value));

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchTerm = searchInput.value.trim().toLowerCase();
                renderActiveTab();
            }, 300);
        });
    }

    document.getElementById("modal-close")?.addEventListener("click", closeItemModal);
    document.getElementById("item-modal")?.addEventListener("click", (e) => {
        if (e.target === document.getElementById("item-modal")) closeItemModal();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeItemModal(); });

    applyGridSize("medium");
    loadAllData();
});

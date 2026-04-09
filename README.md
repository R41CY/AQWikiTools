<p align="center">
  <img src="website/assets/logo.png" alt="AQWikiTools Logo" width="100">
</p>

<h1 align="center">AQWikiTools</h1>

<p align="center">
  <strong>A Chrome extension that supercharges the AQW Wiki with item previews, calculators, inventory tracking, dark mode, and more.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/version-3.0.0-red?style=flat-square" alt="Version 3.0.0">
  <img src="https://img.shields.io/badge/platform-Chrome-yellow?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/open_source-100%25-brightgreen?style=flat-square" alt="Open Source">
</p>

<p align="center">
  <a href="https://github.com/R41CY/AQWikiTools/archive/refs/heads/main.zip"><strong>Download ZIP</strong></a> · 
  <a href="http://aqwwikitools.vercel.app"><strong>Website</strong></a> · 
  <a href="#installation"><strong>Install Guide</strong></a>
</p>

---

## Overview

**AQWikiTools** is a free, open-source Chrome Manifest V3 extension built for [AdventureQuest Worlds](https://www.aq.com/) players who browse the [AQW Wiki](http://aqwwiki.wikidot.com/). It injects rich functionality directly into wiki and account pages — hover previews, merge/quest calculators, owned-item indicators, full dark mode, and a standalone Farm Tracker with thousands of items — so you never have to leave the wiki to plan your next grind.

The extension syncs your in-game inventory from [account.aq.com](https://account.aq.com) and uses it across every feature: highlighting items you own, calculating what you still need, and tracking your overall collection progress.

---

## Is It Safe?

**Yes.** AQWikiTools is 100% open source — every line of code is right here for you to inspect. Here's what you should know:

| Concern | Answer |
|---------|--------|
| **Is the code open?** | Yes. Every file is publicly available in this repository under the [MIT License](LICENSE). |
| **Does it collect my data?** | **No.** The extension does not send your data anywhere. Everything is stored locally in your browser via `chrome.storage.local`. |
| **Does it access my AQW account?** | It reads your public inventory from `account.aq.com` (a page you're already logged into). It never touches your password or login credentials. |
| **What permissions does it need?** | Only `storage` (to save settings locally) and access to `artix.com` (to check server boosts). That's it. |
| **Can I verify it myself?** | Absolutely. You can scan the ZIP on [VirusTotal](https://www.virustotal.com/) before extracting, read every `.js` file in this repo, or use Chrome's built-in extension audit at `chrome://extensions`. |
| **Does it run in the background?** | Only a minimal service worker that proxies fetch requests to the wiki (to bypass CORS). No background data collection, no analytics, no tracking. |

> **Tip:** If you're still unsure, download the ZIP and upload it to [VirusTotal.com](https://www.virustotal.com/) — it's a free tool by Google that scans files with 70+ antivirus engines. You'll see it comes back clean.

---

## Features

### Extension Popup
<img src="website/assets/screenshots/feature-popup.png" alt="Extension Popup" width="320">

Quick access to inventory sync status, settings, dark mode toggles, and the Farm Tracker — all from one clean toolbar popup.

### Settings & Active Boosts
<img src="website/assets/screenshots/feature-popup-2.png" alt="Settings & Active Boosts" width="320">

Toggle dark mode, image previews, and character page settings. View your active server boosts (Gold, XP, Rep, Class Points) and jump straight to the Farm Tracker or AQW Wiki.

### Dark Mode & Owned Items
<img src="website/assets/screenshots/feature-dark-mode.png" alt="Dark Mode" width="600">

Full wiki dark mode with owned-item highlighting. Items you own are color-coded with bank/inventory icons displayed right on the page.

### Wiki Badges & Hover Preview
<img src="website/assets/screenshots/feature-image-preview.png" alt="Wiki Badges & Hover Preview" width="600">

Spot **community-estimated drop rate badges** right next to item names! Plus, hover any item to see its image, rarity, and description instantly.

### Quest Calculator
<img src="website/assets/screenshots/feature-quest-calculator.png" alt="Quest Calculator" width="600">

Automatically detects quest pages and builds a live progress calculator showing needed vs. owned materials, quantities still missing, and an overall progress bar.

### Farm Tracker — To Drop
<img src="website/assets/screenshots/feature-tofarm.png" alt="Farm Tracker To Drop" width="600">

Browse every unowned drop item in a filterable, searchable card grid. Filter by rarity (AC, Seasonal, Non-Rare, Legend) and view drop source details at a glance.

### Item Detail & Source Preview
<img src="website/assets/screenshots/feature-farm-detail.png" alt="Item Detail Modal" width="600">

Click any item to open a detailed modal with its description and drop sources. Hover to preview monster and location. **Now features community-estimated drop rates!**

### Farm Tracker — To Merge
<img src="website/assets/screenshots/feature-tomerge.png" alt="Farm Tracker To Merge" width="600">

View all unowned merge shop items grouped by shop. Each group shows NEEDED badges and an ownership progress indicator per shop.

### In Bank View
<img src="website/assets/screenshots/feature-bank-inv.png" alt="Bank View" width="600">

See all your banked items displayed in a card grid with IN BANK badges, rarity tags, and source information.

### Collection Stats
<img src="website/assets/screenshots/feature-completed.png" alt="Collection Stats" width="600">

Track your overall collection completion with donut charts broken down by Non-Rare, AC, and Seasonal categories.

### Character Page Compare
<img src="website/assets/screenshots/feature-manage-account.png" alt="Character Page Compare" width="600">

When viewing another player's character page, an **[Owned]** tag appears next to items you also own — instantly compare inventories at a glance.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Platform** | Chrome Extension — Manifest V3 |
| **Language** | Vanilla JavaScript (no build step / bundler) |
| **Styling** | Plain CSS with CSS custom properties |
| **Browser APIs** | `chrome.storage.local`, `chrome.runtime`, `chrome.tabs`, Content Scripts, Service Worker |
| **External Data** | Fetch to AQW Wiki (item HTML), Artix.com calendar (server boosts) |
| **Fonts** | [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts |
| **Icons** | [Font Awesome 6.5](https://fontawesome.com/) via CDN |

---

## Project Structure

```
AQWikiTools/
├── manifest.json                   # Extension manifest (MV3)
├── LICENSE                         # MIT License
│
├── assets/
│   ├── icons/                      # Toolbar icons (16, 48, 128 px)
│   └── images/                     # In-page assets (banner, boost icons, bank/inventory badges)
│
├── data/
│   ├── WikiItems.json              # Master item database (~thousands of entries)
│   ├── merge_shops.json            # Merge shop definitions with ingredients and NPCs
│   ├── quests.json                 # Quest data with requirements and locations
│   ├── locations.json              # Map/monster index for source tooltips
│   ├── Classes.json                # Class data
│   └── HardFarm.json              # Hard farm item data
│
├── src/
│   ├── pages/
│   │   ├── popup.html              # Toolbar popup UI
│   │   └── farm-tracker.html       # Full-page Farm Tracker (opens in new tab)
│   │
│   ├── scripts/
│   │   ├── background.js           # Service worker — proxies fetch requests to wiki & Artix
│   │   ├── content.js              # Content script — hover previews, calculators, dark mode, owned badges, boost banners
│   │   ├── inventory-sync.js       # Content script — syncs inventory from account.aq.com to chrome.storage
│   │   ├── popup.js                # Popup controller — settings, theme toggles, sync status, boost display
│   │   └── farm-tracker.js         # Farm Tracker logic — tabs, filters, modals, pagination, charts
│   │
│   └── styles/
│       ├── content.css             # Injected on wiki & account pages
│       ├── popup.css               # Popup stylesheet
│       └── farm-tracker.css        # Farm Tracker stylesheet
│
└── website/                        # Static landing / promo page (not part of the extension bundle)
    ├── index.html
    ├── style.css
    └── assets/
        ├── logo.png
        ├── banner.png
        └── screenshots/            # Feature screenshots used on the landing page
```

---

## Installation

### Quick Download

1. **[Download the ZIP](https://github.com/R41CY/AQWikiTools/archive/refs/heads/main.zip)** from this repository.
2. **Extract** the ZIP to a folder on your computer.
3. Open Chrome and go to `chrome://extensions`.
4. **Enable Developer Mode** (toggle in top-right).
5. Click **"Load unpacked"** and select the extracted folder (the one with `manifest.json`).
6. **Sync your inventory** — visit [account.aq.com/AQW/Inventory](https://account.aq.com/AQW/Inventory) while logged in.
7. **Browse the Wiki** at [aqwwiki.wikidot.com](http://aqwwiki.wikidot.com/) and enjoy!

### From Source

```bash
git clone https://github.com/R41CY/AQWikiTools.git
```

Then follow steps 3–7 above.

---

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Persists synced inventory, user preferences, theme settings, and boost cache locally. |
| `https://www.artix.com/*` | Fetches the Artix event calendar to detect active server boosts (Gold, XP, Rep, Class). |

The extension only runs on `aqwwiki.wikidot.com` and `account.aq.com`. It does not collect, transmit, or store any data externally — everything stays in your browser's local storage.

---

## Screenshots

| Feature | Preview |
|---------|---------|
| Popup | <img src="website/assets/screenshots/feature-popup.png" width="200"> |
| Dark Mode | <img src="website/assets/screenshots/feature-dark-mode.png" width="200"> |
| Hover Preview | <img src="website/assets/screenshots/feature-image-preview.png" width="200"> |
| Quest Calculator | <img src="website/assets/screenshots/feature-quest-calculator.png" width="200"> |
| Farm Tracker | <img src="website/assets/screenshots/feature-tofarm.png" width="200"> |
| Item Detail | <img src="website/assets/screenshots/feature-farm-detail.png" width="200"> |
| Merge Tracker | <img src="website/assets/screenshots/feature-tomerge.png" width="200"> |
| Bank View | <img src="website/assets/screenshots/feature-bank-inv.png" width="200"> |
| Collection Stats | <img src="website/assets/screenshots/feature-completed.png" width="200"> |
| Character Compare | <img src="website/assets/screenshots/feature-manage-account.png" width="200"> |

---

## Credits

AQWikiTools was inspired by and builds upon ideas from:

- **[Wiki Image](https://wikiimage.vercel.app/)** — item image previews for the AQW Wiki
- **[AqwDoIhave](https://github.com/DragoNext/AqwDoIhave)** — inventory ownership checker

Credit to their respective creators for the original concepts and community data.

---

## License

This project is provided under the [MIT License](LICENSE). You are free to use, modify, and distribute it.

---

<p align="center">
  <sub>Built for the AQW community. Free & open source, forever.</sub>
</p>

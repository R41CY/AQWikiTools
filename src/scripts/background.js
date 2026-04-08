/**
 * @file Service worker for AQWikiTools.
 * @description Routes message-passing requests from content scripts to external
 *   endpoints. Supports wiki HTML fetching and Artix calendar retrieval.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchWikiHTML") {
        fetch(request.url)
            .then(res => {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.text();
            })
            .then(html => sendResponse({ success: true, html }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // keep message channel open for async response
    }

    if (request.action === "fetchArtixCalendar") {
        fetch("https://www.artix.com/calendar/")
            .then(res => {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.text();
            })
            .then(html => sendResponse({ success: true, data: html }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

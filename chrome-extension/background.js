// Background service worker (minimal stub)
// All extraction happens via chrome.scripting.executeScript from popup.js

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Gemini Chat Export installed/updated:', details.reason);
});
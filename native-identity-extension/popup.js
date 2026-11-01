"use strict";

const NATIVE_IDENTITY = "Roblox/Darwin";
const JOIN_URL_REGEX = "^https://gamejoin\\.roblox\\.com/v1/join-game(\\?.*)?$";

const placeElement = document.getElementById("place");
const statusElement = document.getElementById("status");
const toggleButton = document.getElementById("toggle");

let activeTab;
let ruleId;
let enabled = false;

function placeIdFromUrl(tabUrl) {
  try {
    const url = new URL(tabUrl);
    if (url.origin !== "https://play.roblox.com" || url.pathname !== "/games/start") {
      return null;
    }
    const placeId = url.searchParams.get("placeId");
    return /^[1-9]\d*$/.test(placeId || "") && Number.isSafeInteger(Number(placeId)) ? placeId : null;
  } catch {
    return null;
  }
}

function ruleForTab(tabId) {
  return {
    id: tabId + 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "rbx-user-agent", operation: "set", value: NATIVE_IDENTITY }
      ]
    },
    condition: {
      regexFilter: JOIN_URL_REGEX,
      initiatorDomains: ["play.roblox.com"],
      requestDomains: ["gamejoin.roblox.com"],
      requestMethods: ["post"],
      resourceTypes: ["xmlhttprequest"],
      tabIds: [tabId]
    }
  };
}

function render() {
  statusElement.textContent = enabled ? "Header change enabled in this tab" : "Header change disabled";
  toggleButton.textContent = enabled ? "Disable for this tab and reload" : "Enable for this tab and reload";
  toggleButton.disabled = false;
}

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const placeId = placeIdFromUrl(tab?.url);
    if (!placeId || !Number.isInteger(tab?.id) || tab.id < 0) {
      placeElement.textContent = "Open a Web Play /games/start?placeId=… tab first.";
      statusElement.textContent = "Unavailable on this tab";
      return;
    }

    activeTab = tab;
    ruleId = tab.id + 1;
    placeElement.textContent = `Place ID: ${placeId}`;
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    enabled = rules.some((rule) => rule.id === ruleId && rule.condition.tabIds?.includes(tab.id));
    render();
  } catch (error) {
    statusElement.textContent = `Could not inspect the tab: ${error.message}`;
  }
}

toggleButton.addEventListener("click", async () => {
  if (!activeTab || !Number.isInteger(ruleId)) return;
  toggleButton.disabled = true;
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
    } else {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [ruleForTab(activeTab.id)] });
    }
    enabled = !enabled;
    render();
    await chrome.tabs.reload(activeTab.id);
    window.close();
  } catch (error) {
    statusElement.textContent = `Could not change the rule: ${error.message}`;
    toggleButton.disabled = false;
  }
});

initialize();

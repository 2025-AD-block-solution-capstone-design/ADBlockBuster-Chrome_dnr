// js/popup.js
import { parseDNRRules } from "./rule-parser/dnr.js";
import { parseCosmeticRules } from "./rule-parser/cosmetic.js";

// 원격 URL
const EASYLIST_URL = "https://easylist.to/easylist/easylist.txt";
const PRIVACY_URL = "https://easylist.to/easylist/easyprivacy.txt";
const PACKAGED_EASY_PATH = "easylist/easylist.txt";
const PACKAGED_PRIV_PATH = "easylist/easyprivacy.txt";

// storage 키
const EASYLIST_HASH_KEY = "easylistHash";
const PRIVACY_HASH_KEY = "privacyHash";
const LAST_CHECK_DATE_KEY = "lastCheckDate";
const RULESET_ID = "block_rule";

const checkBtn = document.getElementById("checkUpdateBtn");
const availableContainer = document.getElementById("availableContainer");
const performBtn = document.getElementById("performUpdateBtn");
const updateStatus = document.getElementById("updateStatus");
const updateLabel = document.getElementById("updateLabel");
const globalToggle = document.getElementById("globalBlockToggle");
const whitelistToggle = document.getElementById("whitelistToggle");
const md5 = SparkMD5;

async function checkForRuleUpdates() {

  // setting.html의 업데이트 탭으로 이동
  chrome.tabs.create({ 
    url: chrome.runtime.getURL("setting.html#update") 
  });
}

async function performUpdate() {
  // setting.html의 업데이트 탭으로 이동
  chrome.tabs.create({ 
    url: chrome.runtime.getURL("setting.html#update") 
  });
}

async function getCurrentDomain() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tabs[0].url).hostname;
  } catch {
    return "";
  }
}

async function updateWhitelistToggle() {
  const domain = await getCurrentDomain();
  const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
  whitelistToggle.checked = whitelist.includes(domain);
}

document.addEventListener("DOMContentLoaded", async () => {
  availableContainer.hidden = true;
  updateStatus.textContent = "";

  checkBtn.addEventListener("click", checkForRuleUpdates);
  performBtn.addEventListener("click", performUpdate);

  const domain = await getCurrentDomain();
  const cfg = await chrome.storage.sync.get([
    "globalBlockingDisabled",
    "whitelist",
  ]);
  globalToggle.checked = !(cfg.globalBlockingDisabled ?? false);
  whitelistToggle.checked = cfg.whitelist?.includes(domain);

  const enableBlocking = globalToggle.checked && !whitelistToggle.checked;
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enableBlocking ? [RULESET_ID] : [],
    disableRulesetIds: enableBlocking ? [] : [RULESET_ID],
  });

  chrome.storage.local.get("TOTAL_BLOCKED_COUNT", (res) => {
    document.getElementById("adCount").textContent =
      res.TOTAL_BLOCKED_COUNT || 0;
  });

  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === "sync") {
      if (changes.globalBlockingDisabled) {
        globalToggle.checked = !changes.globalBlockingDisabled.newValue;
      }
      if (changes.whitelist) {
        await updateWhitelistToggle();
      }
    }
    if (namespace === "local" && changes.TOTAL_BLOCKED_COUNT) {
      document.getElementById("adCount").textContent =
        changes.TOTAL_BLOCKED_COUNT.newValue || 0;
    }
  });

  document
    .getElementById("goToSettingsBtn")
    .addEventListener("click", () =>
      chrome.tabs.create({ url: chrome.runtime.getURL("setting.html") })
    );

  globalToggle.addEventListener("change", async () => {
    const disabled = !globalToggle.checked;
    await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
    const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
    const domain = await getCurrentDomain();
    const isWhitelisted = whitelist.includes(domain);
    const enableBlocking = !disabled && !isWhitelisted;
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableBlocking ? [RULESET_ID] : [],
      disableRulesetIds: enableBlocking ? [] : [RULESET_ID],
    });
  });

  whitelistToggle.addEventListener("change", async () => {
    const domain = await getCurrentDomain();
    const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
    const list = whitelistToggle.checked
      ? Array.from(new Set([...whitelist, domain]))
      : whitelist.filter((d) => d !== domain);
    await chrome.storage.sync.set({ whitelist: list });
    const { globalBlockingDisabled = false } = await chrome.storage.sync.get(
      "globalBlockingDisabled"
    );
    const enableBlocking = !globalBlockingDisabled && !whitelistToggle.checked;
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableBlocking ? [RULESET_ID] : [],
      disableRulesetIds: enableBlocking ? [] : [RULESET_ID],
    });
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
  });
});

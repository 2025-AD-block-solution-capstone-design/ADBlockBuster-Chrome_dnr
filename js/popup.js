import { initRulesetInfo } from './update-info.js';

const RULESET_ID = 'block_rule';
const STORAGE_TOTAL_KEY = 'totalBlockedCount';
const STORAGE_DOMAIN_KEY = 'blockedDomainCounts';
const MAX_DOMAIN_ROWS = 5;

const checkBtn        = document.getElementById('checkUpdateBtn');
const updateStatus    = document.getElementById('updateStatus');
const versionLabel    = document.getElementById('rulesetVersion');
const globalToggle    = document.getElementById('globalBlockToggle');
const whitelistToggle = document.getElementById('whitelistToggle');
const adCountDisplay  = document.getElementById('adCount');
const domainList      = document.getElementById('domainStats');
const settingsBtn     = document.getElementById('goToSettingsBtn');
const resetBtn        = document.getElementById('resetStatsBtn');

let currentDomain = '';

document.addEventListener('DOMContentLoaded', async () => {
  initRulesetInfo({
    checkButton: checkBtn,
    statusNode:  updateStatus,
    versionNode: versionLabel
  });

  currentDomain = await resolveActiveTabDomain();
  if (!currentDomain) {
    whitelistToggle.disabled = true;
    whitelistToggle.checked = false;
  }

  await initializeToggles();
  await loadStoredStats();

  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('setting.html') });
  });

  globalToggle.addEventListener('change', handleGlobalToggleChange);
  whitelistToggle.addEventListener('change', handleWhitelistToggleChange);
  resetBtn.addEventListener('click', handleResetStats);

  try {
    const response = await sendMessage({ type: 'REQUEST_BLOCK_STATS' });
    if (response) {
      renderStats(response.totalBlockedCount, response.topBlockedDomains);
    }
  } catch (error) {
    console.warn('[popup] Failed to fetch stats:', error);
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'TOTAL_BLOCKED_COUNT_UPDATED') {
    const payload = message.payload ?? {};
    renderStats(payload.totalBlockedCount, payload.topBlockedDomains ?? payload.blockedDomainCounts);
  }
});

async function resolveActiveTabDomain() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function initializeToggles() {
  const { globalBlockingDisabled = false, whitelist = [] } =
    await chrome.storage.sync.get(['globalBlockingDisabled', 'whitelist']);

  globalToggle.checked = globalBlockingDisabled;
  whitelistToggle.checked = currentDomain ? whitelist.includes(currentDomain) : false;

  await applyGlobalBlocking(globalBlockingDisabled);
}

async function handleGlobalToggleChange() {
  await applyGlobalBlocking(globalToggle.checked);
}

async function handleWhitelistToggleChange() {
  if (!currentDomain) return;
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  const updated = whitelistToggle.checked
    ? Array.from(new Set([...whitelist, currentDomain]))
    : whitelist.filter(domain => domain !== currentDomain);

  await chrome.storage.sync.set({ whitelist: updated });

  reloadActiveTab();
}

async function applyGlobalBlocking(disabled) {
  await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds:  disabled ? [] : [RULESET_ID],
    disableRulesetIds: disabled ? [RULESET_ID] : []
  });
}

async function handleResetStats() {
  resetBtn.disabled = true;
  try {
    await sendMessage({ type: 'RESET_BLOCK_STATS' });
    renderStats(0, {});
  } catch (error) {
    console.warn('[popup] Failed to reset stats:', error);
  } finally {
    resetBtn.disabled = false;
  }
}

async function loadStoredStats() {
  const data = await chrome.storage.local.get({
    [STORAGE_TOTAL_KEY]: 0,
    [STORAGE_DOMAIN_KEY]: {}
  });
  renderStats(data[STORAGE_TOTAL_KEY], data[STORAGE_DOMAIN_KEY]);
}

function renderStats(total = 0, domainCounts = {}) {
  adCountDisplay.textContent = String(total ?? 0);

  const entries = Array.isArray(domainCounts)
    ? domainCounts
    : Object.entries(domainCounts).map(([domain, count]) => ({ domain, count }));

  if (!entries.length) {
    domainList.innerHTML = '<li>차단된 기록이 없습니다.</li>';
    return;
  }

  const sorted = entries
    .filter(item => item?.domain)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, MAX_DOMAIN_ROWS);

  if (!sorted.length) {
    domainList.innerHTML = '<li>차단된 기록이 없습니다.</li>';
    return;
  }

  domainList.innerHTML = '';
  sorted.forEach(({ domain, count }) => {
    const li = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = domain;
    if (currentDomain && currentDomain === domain) {
      name.classList.add('current-domain');
    }
    li.appendChild(name);

    const value = document.createElement('span');
    value.className = 'domain-count';
    value.textContent = count ?? 0;
    li.appendChild(value);

    domainList.appendChild(li);
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function reloadActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    chrome.tabs.reload(tabs[0].id);
  }
}

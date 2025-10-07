import { ACTIONS } from './constant/constant.js';

const COSMETIC_JSON_URL = chrome.runtime.getURL('ruleset/cosmeticList-selector.json');
const TOTAL_COUNT_KEY = 'totalBlockedCount';
const DOMAIN_COUNT_KEY = 'blockedDomainCounts';
const WHITELIST_RULE_START_ID = 100000;
const MAX_DOMAIN_ENTRIES = 5;

let cosmeticRuleset = [];
let totalBlockedCount = 0;
let blockedDomainCounts = {};

console.log('[service-worker] Starting background service worker.');

chrome.declarativeNetRequest.setExtensionActionOptions({
  displayActionCountAsBadgeText: true
}).catch(error => {
  console.warn('[service-worker] Failed to set action options:', error);
});

initialize().catch(error => {
  console.error('[service-worker] Failed during initialization:', error);
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatched);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && Object.prototype.hasOwnProperty.call(changes, 'whitelist')) {
    const domains = changes.whitelist.newValue ?? [];
    refreshWhitelistRules(domains).catch(err => {
      console.error('[service-worker] Failed to refresh whitelist rules:', err);
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return;
  }

  switch (message.type) {
    case 'GET_COSMETIC_RULESET':
      sendResponse({ ruleset: cosmeticRuleset });
      return true;
    case 'REQUEST_BLOCK_STATS':
      sendResponse({
        totalBlockedCount,
        topBlockedDomains: getTopBlockedDomains(blockedDomainCounts, MAX_DOMAIN_ENTRIES)
      });
      return true;
    case 'RESET_BLOCK_STATS':
      resetBlockStats()
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    case 'REFRESH_WHITELIST_RULES':
      refreshWhitelistRules(message.domains ?? undefined)
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    default:
      break;
  }

  return false;
});

async function initialize() {
  await loadCosmeticRuleset();

  const stored = await chrome.storage.local.get({
    [TOTAL_COUNT_KEY]: 0,
    [DOMAIN_COUNT_KEY]: {}
  });
  totalBlockedCount = stored[TOTAL_COUNT_KEY] ?? 0;
  blockedDomainCounts = stored[DOMAIN_COUNT_KEY] ?? {};

  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  await refreshWhitelistRules(whitelist);
}

async function loadCosmeticRuleset() {
  try {
    const response = await fetch(COSMETIC_JSON_URL);
    const raw = await response.json();
    cosmeticRuleset = raw.map(rule => ({
      selector: rule.selector,
      domain: rule.domain,
      action: { type: ACTIONS.HIDE }
    }));
    console.log('[service-worker] Cosmetic ruleset loaded.');
  } catch (error) {
    console.error('[service-worker] Failed to load cosmetic ruleset.', error);
    cosmeticRuleset = [];
  }
}

async function refreshWhitelistRules(domains) {
  let domainList = domains;
  if (!Array.isArray(domainList)) {
    const data = await chrome.storage.sync.get('whitelist');
    domainList = data.whitelist ?? [];
  }

  domainList = domainList
    .map(domain => (typeof domain === 'string' ? domain.trim().toLowerCase() : ''))
    .filter(Boolean);

  const hosts = [];
  const seen = new Set();
  const pushHost = host => {
    if (!seen.has(host)) {
      seen.add(host);
      hosts.push(host);
    }
  };

  domainList.forEach(domain => {
    pushHost(domain);
    if (domain.startsWith('www.')) {
      pushHost(domain.replace(/^www\./, ''));
    }
  });

  const allowRules = hosts.map((host, index) => ({
    id: WHITELIST_RULE_START_ID + index,
    priority: 10,
    action: { type: 'allow' },
    condition: {
      urlFilter: `||${host}^`,
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'media', 'websocket', 'other']
    }
  }));

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removableIds = existing
    .filter(rule => rule.id >= WHITELIST_RULE_START_ID)
    .map(rule => rule.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: allowRules,
    removeRuleIds: removableIds
  });

  console.log('[service-worker] Whitelist updated:', domainList);
}

function handleRuleMatched(info) {
  const { request, rule } = info;
  if (!rule || rule.action?.type !== 'block') {
    return;
  }
  if (!request || request.documentLifecycle === 'prerender') {
    return;
  }

  console.log('[service-worker] Blocked request:', {
    ruleId: rule.id,
    url: request.url,
    tabId: info.tabId
  });

  totalBlockedCount += 1;
  const hostname = extractHostname(request.url);
  if (hostname) {
    blockedDomainCounts[hostname] = (blockedDomainCounts[hostname] ?? 0) + 1;
  }

  chrome.storage.local.set({
    [TOTAL_COUNT_KEY]: totalBlockedCount,
    [DOMAIN_COUNT_KEY]: blockedDomainCounts
  });

  const topBlockedDomains = getTopBlockedDomains(blockedDomainCounts, MAX_DOMAIN_ENTRIES);
  notifyClients({
    type: 'TOTAL_BLOCKED_COUNT_UPDATED',
    payload: {
      totalBlockedCount,
      topBlockedDomains
    }
  });
}

function notifyClients(message) {
  chrome.runtime.sendMessage(message, () => {
    // 수신자가 없어도 lastError가 찍히므로 콘솔 스팸 방지를 위해 처리
    if (chrome.runtime.lastError) {
      return;
    }
  });
}

function extractHostname(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function getTopBlockedDomains(counts = {}, limit = 5) {
  return Object.entries(counts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, limit);
}

async function resetBlockStats() {
  totalBlockedCount = 0;
  blockedDomainCounts = {};
  await chrome.storage.local.set({
    [TOTAL_COUNT_KEY]: 0,
    [DOMAIN_COUNT_KEY]: {}
  });
  notifyClients({
    type: 'TOTAL_BLOCKED_COUNT_UPDATED',
    payload: {
      totalBlockedCount,
      topBlockedDomains: []
    }
  });
}

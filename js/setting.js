import { initRulesetInfo } from './update-info.js';

const RULESET_ID = 'block_rule';

const checkBtn         = document.getElementById('checkUpdateBtn');
const updateStatus     = document.getElementById('updateStatus');
const versionLabel     = document.getElementById('rulesetVersion');
const globalToggle     = document.getElementById('globalBlockToggle');
const menuBlockBtn     = document.getElementById('menu-block-settings');
const menuWhiteBtn     = document.getElementById('menu-whitelist');
const blockSection     = document.getElementById('block-settings');
const whitelistSection = document.getElementById('whitelist-management');
const whitelistForm    = document.getElementById('whitelistForm');
const whitelistInput   = document.getElementById('whitelistInput');
const whitelistList    = document.getElementById('whitelistList');

document.addEventListener('DOMContentLoaded', async () => {
  initRulesetInfo({
    checkButton: checkBtn,
    statusNode:  updateStatus,
    versionNode: versionLabel
  });

  menuBlockBtn.addEventListener('click', () => {
    blockSection.style.display     = 'block';
    whitelistSection.style.display = 'none';
  });

  menuWhiteBtn.addEventListener('click', () => {
    blockSection.style.display     = 'none';
    whitelistSection.style.display = 'block';
    renderWhitelist();
  });

  const { globalBlockingDisabled = false } = await chrome.storage.sync.get('globalBlockingDisabled');
  globalToggle.checked = globalBlockingDisabled;
  await applyGlobalBlocking(globalBlockingDisabled);
  globalToggle.addEventListener('change', async () => {
    await applyGlobalBlocking(globalToggle.checked);
  });

  whitelistForm.addEventListener('submit', async event => {
    event.preventDefault();
    const site = whitelistInput.value.trim().toLowerCase();
    if (!site) return;

    const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
    if (whitelist.includes(site)) {
      whitelistInput.value = '';
      return;
    }

    const updated = [...whitelist, site];
    await chrome.storage.sync.set({ whitelist: updated });
    whitelistInput.value = '';
    renderWhitelist();
  });

  renderWhitelist();
});

async function renderWhitelist() {
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  whitelistList.innerHTML = '';

  whitelist.forEach(site => {
    const li = document.createElement('li');

    const domainSpan = document.createElement('span');
    domainSpan.className = 'site-domain';
    domainSpan.textContent = site;
    li.appendChild(domainSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '삭제';
    removeBtn.addEventListener('click', async () => {
      const { whitelist: existing = [] } = await chrome.storage.sync.get('whitelist');
      const filtered = existing.filter(entry => entry !== site);
      await chrome.storage.sync.set({ whitelist: filtered });
      renderWhitelist();
    });
    li.appendChild(removeBtn);

    whitelistList.appendChild(li);
  });
}

async function applyGlobalBlocking(disabled) {
  await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds:  disabled ? [] : [RULESET_ID],
    disableRulesetIds: disabled ? [RULESET_ID] : []
  });
}

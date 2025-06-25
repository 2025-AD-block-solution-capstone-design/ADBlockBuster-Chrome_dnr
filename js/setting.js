// js/setting.js
import { parseDNRRules }      from './rule-parser/dnr.js';
import { parseCosmeticRules } from './rule-parser/cosmetic.js';

const EASYLIST_URL        = 'https://easylist.to/easylist/easylist.txt';
const PRIVACY_URL         = 'https://easylist.to/easylist/easyprivacy.txt';
const PACKAGED_EASY_PATH  = 'easylist/easylist.txt';
const PACKAGED_PRIV_PATH  = 'easylist/easyprivacy.txt';

const EASYLIST_HASH_KEY   = 'easylistHash';
const PRIVACY_HASH_KEY    = 'privacyHash';
const LAST_CHECK_DATE_KEY = 'lastCheckDate';
const RULESET_ID          = 'block_rule';

const checkBtn           = document.getElementById('checkUpdateBtn');
const availableContainer = document.getElementById('availableContainer');
const performBtn         = document.getElementById('performUpdateBtn');
const updateStatus       = document.getElementById('updateStatus');
const updateLabel        = document.getElementById('updateLabel');
const globalToggle       = document.getElementById('globalBlockToggle');
const menuBlockBtn       = document.getElementById('menu-block-settings');
const menuWhiteBtn       = document.getElementById('menu-whitelist');
const blockSection       = document.getElementById('block-settings');
const whitelistSection   = document.getElementById('whitelist-management');
const whitelistForm      = document.getElementById('whitelistForm');
const whitelistInput     = document.getElementById('whitelistInput');
const whitelistList      = document.getElementById('whitelistList');

const md5 = SparkMD5;

/** 1) 업데이트 가능 여부 확인 → availableContainer 노출 */
async function checkForRuleUpdates() {
  updateStatus.textContent = '업데이트 확인 중…';

  const { easylistHash, privacyHash } = await chrome.storage.local.get({
    easylistHash: '',
    privacyHash:  ''
  });

  let oldEasyHash    = easylistHash;
  let oldPrivacyHash = privacyHash;

  if (!oldEasyHash) {
    const txt = await fetch(chrome.runtime.getURL(PACKAGED_EASY_PATH)).then(r=>r.text());
    oldEasyHash = md5.hash(txt);
  }
  if (!oldPrivacyHash) {
    const txt = await fetch(chrome.runtime.getURL(PACKAGED_PRIV_PATH)).then(r=>r.text());
    oldPrivacyHash = md5.hash(txt);
  }

  const [easyTxt, privacyTxt] = await Promise.all([
    fetch(EASYLIST_URL).then(r=>r.text()),
    fetch(PRIVACY_URL).then(r=>r.text())
  ]);
  const newEasyHash    = md5.hash(easyTxt);
  const newPrivacyHash = md5.hash(privacyTxt);

  if (newEasyHash !== oldEasyHash || newPrivacyHash !== oldPrivacyHash) {
    availableContainer.hidden = false;
    updateStatus.textContent   = '업데이트 가능합니다.';
  } else {
    updateStatus.textContent = '이미 최신입니다.';
  }

  await chrome.storage.local.set({
    [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0,10)
  });
}

/** 2) performUpdateBtn 클릭 → 실제 업데이트 */
async function performUpdate() {
  performBtn.disabled    = true;
  updateLabel.textContent = '업데이트 중…';

  try {
    const [easyTxt, privacyTxt] = await Promise.all([
      fetch(EASYLIST_URL).then(r=>r.text()),
      fetch(PRIVACY_URL).then(r=>r.text())
    ]);

    const dnrEasy  = parseDNRRules(easyTxt);
    const dnrPriv  = parseDNRRules(privacyTxt);
    const cosmetic = parseCosmeticRules(easyTxt);

    await chrome.storage.local.set({
      easylist:           dnrEasy,
      easyprivacy:        dnrPriv,
      cosmetic:           cosmetic,
      [EASYLIST_HASH_KEY]:  md5.hash(easyTxt),
      [PRIVACY_HASH_KEY]:   md5.hash(privacyTxt),
      [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0,10)
    });

    chrome.runtime.sendMessage({ action: 'rulesUpdated' });

    updateStatus.textContent = '업데이트 완료 ✅';
    availableContainer.hidden = true;
  } catch (err) {
    updateStatus.textContent = `업데이트 실패 ❌: ${err.message}`;
  } finally {
    performBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // UI 초기화
  availableContainer.hidden = true;
  updateStatus.textContent   = '';

  // 1) “업데이트 확인”
  checkBtn.addEventListener('click', checkForRuleUpdates);
  // 3) “업데이트 실행”
  performBtn.addEventListener('click', performUpdate);

  // —— 이하 기존 설정 로직 유지 ——
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
  globalToggle.addEventListener('change', async () => {
    const disabled = globalToggle.checked;
    await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds:  disabled ? [] : [RULESET_ID],
      disableRulesetIds: disabled ? [RULESET_ID] : []
    });
  });

  whitelistForm.addEventListener('submit', async e => {
    e.preventDefault();
    const site = whitelistInput.value.trim().toLowerCase();
    if (!site) return;
    const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
    if (!whitelist.includes(site)) {
      whitelist.push(site);
      await chrome.storage.sync.set({ whitelist });
      renderWhitelist();
      whitelistInput.value = '';
    }
  });
});

// 화이트리스트 렌더링 헬퍼
async function renderWhitelist() {
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  whitelistList.innerHTML = '';
  whitelist.forEach(site => {
    const li = document.createElement('li');
    li.textContent = site;
    const btn = document.createElement('button');
    btn.textContent = '삭제';
    btn.addEventListener('click', async () => {
      const { whitelist=[] } = await chrome.storage.sync.get('whitelist');
      const newList = whitelist.filter(s => s !== site);
      await chrome.storage.sync.set({ whitelist: newList });
      renderWhitelist();
    });
    li.appendChild(btn);
    whitelistList.appendChild(li);
  });
}

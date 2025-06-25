// js/popup.js
import { parseDNRRules }      from './rule-parser/dnr.js';
import { parseCosmeticRules } from './rule-parser/cosmetic.js';

// 원격 URL
const EASYLIST_URL        = 'https://easylist.to/easylist/easylist.txt';
const PRIVACY_URL         = 'https://easylist.to/easylist/easyprivacy.txt';
// 패키지 내 파일 (초기 해시 계산용, 저장은 안 함)
const PACKAGED_EASY_PATH  = 'easylist/easylist.txt';
const PACKAGED_PRIV_PATH  = 'easylist/easyprivacy.txt';

// storage 키
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
const whitelistToggle    = document.getElementById('whitelistToggle');
const adCountDisplay     = document.getElementById('adCount');
const settingsBtn        = document.getElementById('goToSettingsBtn');

const md5 = SparkMD5; // spark-md5.min.js

/**
 * 1) 업데이트 가능 여부만 체크 → availableContainer 노출
 */
async function checkForRuleUpdates() {
  updateStatus.textContent = '업데이트 확인 중…';

  // (a) 저장된 이전 해시 or 패키지 파일에서 해시 계산
  const { easylistHash, privacyHash } = await chrome.storage.local.get({
    easylistHash: '',
    privacyHash:  ''
  });

  let oldEasyHash   = easylistHash;
  let oldPrivacyHash= privacyHash;

  if (!oldEasyHash) {
    const txt = await fetch(chrome.runtime.getURL(PACKAGED_EASY_PATH)).then(r=>r.text());
    oldEasyHash = md5.hash(txt);
  }
  if (!oldPrivacyHash) {
    const txt = await fetch(chrome.runtime.getURL(PACKAGED_PRIV_PATH)).then(r=>r.text());
    oldPrivacyHash = md5.hash(txt);
  }

  // (b) 원격 다운로드 → 새 해시
  const [easyTxt, privacyTxt] = await Promise.all([
    fetch(EASYLIST_URL).then(r=>r.text()),
    fetch(PRIVACY_URL).then(r=>r.text())
  ]);
  const newEasyHash    = md5.hash(easyTxt);
  const newPrivacyHash = md5.hash(privacyTxt);

  // (c) 비교
  if (newEasyHash !== oldEasyHash || newPrivacyHash !== oldPrivacyHash) {
    availableContainer.hidden = false;
    updateStatus.textContent   = '업데이트 가능합니다.';
  } else {
    updateStatus.textContent = '이미 최신입니다.';
  }

  // (d) 오늘 체크 완료
  await chrome.storage.local.set({
    [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0,10)
  });
}

/**
 * 2) performUpdateBtn 클릭 → 실제로 원격 → 파싱 → 저장 → 반영
 */
async function performUpdate() {
  performBtn.disabled    = true;
  updateLabel.textContent = '업데이트 중…';

  try {
    // (1) 원격 다운로드
    const [easyTxt, privacyTxt] = await Promise.all([
      fetch(EASYLIST_URL).then(r=>r.text()),
      fetch(PRIVACY_URL).then(r=>r.text())
    ]);

    // (2) 파싱 → JSON 룰셋
    const dnrEasy  = parseDNRRules(easyTxt);
    const dnrPriv  = parseDNRRules(privacyTxt);
    const cosmetic = parseCosmeticRules(easyTxt);

    // (3) JSON 룰셋 + 새 해시 저장
    await chrome.storage.local.set({
      easylist:           dnrEasy,
      easyprivacy:        dnrPriv,
      cosmetic:           cosmetic,
      [EASYLIST_HASH_KEY]:  md5.hash(easyTxt),
      [PRIVACY_HASH_KEY]:   md5.hash(privacyTxt),
      [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0,10)
    });

    // (4) 콘텐츠 스크립트에 반영 요청
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

  // 1) “업데이트 확인” 버튼
  checkBtn.addEventListener('click', checkForRuleUpdates);
  // 3) “업데이트 실행” 버튼
  performBtn.addEventListener('click', performUpdate);

  // — 이하 기존 전체 차단·화이트리스트 로직 그대로 유지 —
  const domain = await (async()=>{
    const tabs = await chrome.tabs.query({active:true,currentWindow:true});
    try { return new URL(tabs[0].url).hostname; }
    catch { return ''; }
  })();

  const cfg = await chrome.storage.sync.get(['globalBlockingDisabled','whitelist']);
  globalToggle.checked    = cfg.globalBlockingDisabled ?? false;
  whitelistToggle.checked = cfg.whitelist?.includes(domain);

  const enableBlocking = !globalToggle.checked && !whitelistToggle.checked;
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds:  enableBlocking ? [RULESET_ID] : [],
    disableRulesetIds: enableBlocking ? [] : [RULESET_ID]
  });

  chrome.storage.local.get('totalBlockedCount', res => {
    document.getElementById('adCount').textContent = res.totalBlockedCount || 0;
  });

  document.getElementById('goToSettingsBtn').addEventListener('click', () =>
      chrome.tabs.create({url: chrome.runtime.getURL('setting.html')})
  );
  globalToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ globalBlockingDisabled: globalToggle.checked });
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds:  globalToggle.checked ? [] : [RULESET_ID],
      disableRulesetIds: globalToggle.checked ? [RULESET_ID] : []
    });
  });
  whitelistToggle.addEventListener('change', async () => {
    const { whitelist=[] } = await chrome.storage.sync.get('whitelist');
    const list = whitelistToggle.checked
        ? Array.from(new Set([...(whitelist), domain]))
        : whitelist.filter(d=>d!==domain);
    await chrome.storage.sync.set({ whitelist: list });
    const tabs = await chrome.tabs.query({active:true,currentWindow:true});
    if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
  });
});

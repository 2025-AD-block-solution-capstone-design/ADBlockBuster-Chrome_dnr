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
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableBlocking ? [RULESET_ID] : [],
      disableRulesetIds: enableBlocking ? [] : [RULESET_ID],
    });
  } catch (error) {
    console.error('룰셋 활성화/비활성화 오류:', error);
  }

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
    if (namespace === "local") {
      // 모든 차단 카운트 변경사항 처리
      if (changes.TOTAL_BLOCKED_COUNT) {
        document.getElementById("adCount").textContent =
          changes.TOTAL_BLOCKED_COUNT.newValue || 0;
      }
      if (changes.DNR_BLOCKED_COUNT || changes.COSMETIC_BLOCKED_COUNT) {
        // 팝업에서는 총 차단 수만 표시하므로 TOTAL_BLOCKED_COUNT가 있으면 업데이트
        const result = await chrome.storage.local.get("TOTAL_BLOCKED_COUNT");
        document.getElementById("adCount").textContent = result.TOTAL_BLOCKED_COUNT || 0;
      }
    }
  });
  
  // 서비스 워커로부터 메시지 수신
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOTAL_BLOCKED_COUNT_UPDATED') {
      console.log('📊 팝업에서 차단 카운트 업데이트 메시지 받음:', message.payload);
      document.getElementById("adCount").textContent = message.payload.totalBlockedCount || 0;
      sendResponse({success: true});
      return true;
    }
  });

  // 설정 버튼 이벤트 리스너 (안전한 방식)
  const settingsBtn = document.getElementById("goToSettingsBtn");
  if (settingsBtn) {
    console.log('설정 버튼 발견됨, 이벤트 리스너 추가 중...');
    settingsBtn.addEventListener("click", () => {
      console.log('설정 버튼 클릭됨!');
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL("setting.html") });
        console.log('설정 페이지 열기 요청 완료');
      } catch (error) {
        console.error('설정 페이지 열기 오류:', error);
      }
    });
    console.log('설정 버튼 이벤트 리스너 추가 완료');
  } else {
    console.error('설정 버튼을 찾을 수 없습니다. HTML을 확인해주세요.');
  }

  globalToggle.addEventListener("change", async () => {
    try {
      const disabled = !globalToggle.checked;
      await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
      
      // 서비스 워커에 상태 변경 알림
      await chrome.runtime.sendMessage({ type: 'RELOAD_COSMETIC_FILTER' });
      
      // 현재 탭 새로고침 (변경사항 즉시 반영)
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        chrome.tabs.reload(tabs[0].id);
      }
    } catch (error) {
      console.error('전역 토글 변경 오류:', error);
    }
  });

  whitelistToggle.addEventListener("change", async () => {
    try {
      const domain = await getCurrentDomain();
      const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
      const list = whitelistToggle.checked
        ? Array.from(new Set([...whitelist, domain]))
        : whitelist.filter((d) => d !== domain);
      await chrome.storage.sync.set({ whitelist: list });
      
      // 화이트리스트 DNR 룰 업데이트
      await chrome.runtime.sendMessage({ type: 'UPDATE_WHITELIST_RULES' });
      
      // 코스메틱 필터 재로드 요청
      await chrome.runtime.sendMessage({ type: 'RELOAD_COSMETIC_FILTER' });
      
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    } catch (error) {
      console.error('화이트리스트 토글 변경 오류:', error);
    }
  });
});

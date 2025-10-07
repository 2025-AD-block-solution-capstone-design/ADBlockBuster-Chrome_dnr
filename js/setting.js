// js/setting.js
import { parseDNRRules } from "./rule-parser/dnr.js";
import { parseCosmeticRules } from "./rule-parser/cosmetic.js";

const EASYLIST_URL = "https://easylist.to/easylist/easylist.txt";
const PRIVACY_URL = "https://easylist.to/easylist/easyprivacy.txt";
const PACKAGED_EASY_PATH = "easylist/easylist.txt";
const PACKAGED_PRIV_PATH = "easylist/easyprivacy.txt";

const EASYLIST_HASH_KEY = "easylistHash";
const PRIVACY_HASH_KEY = "privacyHash";
const LAST_CHECK_DATE_KEY = "lastCheckDate";
const RULESET_ID = "block_rule";

const md5 = SparkMD5;

// IndexedDB 관리 클래스
class RulesetDB {
  constructor() {
    this.dbName = 'ADBlockBusterRulesets';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB 연결 성공');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        console.log('IndexedDB 스키마 업그레이드 중...');
        const db = event.target.result;
        
        // rulesets 스토어 생성 (기존 데이터 자동 삭제)
        if (db.objectStoreNames.contains('rulesets')) {
          db.deleteObjectStore('rulesets');
        }
        
        const store = db.createObjectStore('rulesets', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('IndexedDB 스키마 생성 완료');
      };
    });
  }

  async saveRulesets(easylist, easyprivacy, cosmetic) {
    if (!this.db) await this.init();
    
    // 먼저 기존 데이터 삭제 (조건 1 충족)
    await this.clearAllRulesets();
    
    // 데이터베이스 연결 상태 재확인
    if (!this.db || !this.db.objectStoreNames.contains('rulesets')) {
      await this.init(); // 재초기화 시도
    }
    
    // 새로운 트랜잭션으로 데이터 저장
    const transaction = this.db.transaction(['rulesets'], 'readwrite');
    const store = transaction.objectStore('rulesets');
    
    const timestamp = Date.now();
    const rulesetData = {
      id: 'current',
      easylist: easylist,
      easyprivacy: easyprivacy,
      cosmetic: cosmetic,
      timestamp: timestamp,
      version: '1.0'
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(rulesetData);
      request.onsuccess = () => {
        console.log('IndexedDB에 룰셋 저장 완료:', {
          easylistRules: easylist?.length || 0,
          easyprivacyRules: easyprivacy?.length || 0,
          cosmeticRules: cosmetic?.length || 0
        });
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getRulesets() {
    if (!this.db) await this.init();
    
    // 데이터베이스 연결 상태 확인
    if (!this.db || !this.db.objectStoreNames.contains('rulesets')) {
      await this.init(); // 재초기화 시도
    }
    
    const transaction = this.db.transaction(['rulesets'], 'readonly');
    const store = transaction.objectStore('rulesets');
    
    return new Promise((resolve, reject) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllRulesets() {
    if (!this.db) await this.init();
    
    // 데이터베이스 연결 상태 확인
    if (!this.db || this.db.readyState === 'done' || !this.db.objectStoreNames.contains('rulesets')) {
      console.warn('IndexedDB가 준비되지 않았거나 rulesets 스토어가 없습니다.');
      await this.init(); // 재초기화 시도
    }
    
    const transaction = this.db.transaction(['rulesets'], 'readwrite');
    const store = transaction.objectStore('rulesets');
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        console.log('IndexedDB 기존 룰셋 데이터 삭제 완료');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getStorageSize() {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      return { used, quota, usedMB: (used / 1024 / 1024).toFixed(2) };
    } catch (error) {
      console.warn('스토리지 사이즈 확인 실패:', error);
      return { used: 0, quota: 0, usedMB: '0' };
    }
  }
}

// 전역 IndexedDB 인스턴스
const rulesetDB = new RulesetDB();

// 전역 DOM 요소들을 나중에 할당할 변수들
let checkBtn, availableContainer, performBtn, updateStatus, updateLabel, globalToggle;

// 글로벌 renderWhitelist 함수 (storage listener에서 사용)
let globalRenderWhitelist = null;

// 전역 탭 전환 함수
function switchTab(tabName) {
  console.log("switchTab called with:", tabName);
  
  const menuBlockBtn = document.getElementById("menu-block-settings");
  const menuWhiteBtn = document.getElementById("menu-whitelist");
  const menuUpdateBtn = document.getElementById("menu-update");
  const blockSection = document.getElementById("block-settings");
  const whitelistSection = document.getElementById("whitelist-management");
  const updateSection = document.getElementById("update-management");
  
  console.log("Found elements:", {
    menuBlockBtn: !!menuBlockBtn,
    menuWhiteBtn: !!menuWhiteBtn,
    menuUpdateBtn: !!menuUpdateBtn,
    blockSection: !!blockSection,
    whitelistSection: !!whitelistSection,
    updateSection: !!updateSection
  });
  
  // 모든 버튼에서 active 클래스 제거
  [menuBlockBtn, menuWhiteBtn, menuUpdateBtn].forEach(btn => {
    if (btn) {
      btn.classList.remove("active");
      console.log("Removed active from:", btn.id);
    }
  });
  
  // 모든 섹션 숨기기 (Bootstrap 클래스도 함께 처리)
  [blockSection, whitelistSection, updateSection].forEach(section => {
    if (section) {
      section.style.display = "none";
      section.classList.add("d-none");
      section.classList.remove("d-block");
      console.log("Hidden section:", section.id);
    }
  });
  
  // 선택된 탭에 따라 표시
  switch(tabName) {
    case 'block':
      if (menuBlockBtn) {
        menuBlockBtn.classList.add("active");
        console.log("Activated block button");
      }
      if (blockSection) {
        blockSection.style.display = "block";
        blockSection.classList.remove("d-none");
        blockSection.classList.add("d-block");
        console.log("Showed block section");
        // 대시보드 업데이트
        updateDashboard();
      }
      break;
    case 'whitelist':
      if (menuWhiteBtn) {
        menuWhiteBtn.classList.add("active");
        console.log("Activated whitelist button");
      }
      if (whitelistSection) {
        whitelistSection.style.display = "block";
        whitelistSection.classList.remove("d-none");
        whitelistSection.classList.add("d-block");
        console.log("Showed whitelist section");
        // 화이트리스트 렌더링
        if (globalRenderWhitelist) globalRenderWhitelist();
      }
      break;
    case 'update':
      if (menuUpdateBtn) {
        menuUpdateBtn.classList.add("active");
        console.log("Activated update button");
      }
      if (updateSection) {
        updateSection.style.display = "block";
        updateSection.classList.remove("d-none");
        updateSection.classList.add("d-block");
        console.log("Showed update section");
      }
      break;
    default:
      console.warn("Unknown tab:", tabName);
  }
}

// 대시보드 업데이트 함수
async function updateDashboard() {
  try {
    const result = await chrome.storage.local.get([
      'TOTAL_BLOCKED_COUNT',
      'DNR_BLOCKED_COUNT', 
      'COSMETIC_BLOCKED_COUNT'
    ]);
    
    document.getElementById('totalBlockedCount').textContent = result.TOTAL_BLOCKED_COUNT || 0;
    document.getElementById('dnrBlockedCount').textContent = result.DNR_BLOCKED_COUNT || 0;
    document.getElementById('cosmeticBlockedCount').textContent = result.COSMETIC_BLOCKED_COUNT || 0;
    
    // 스토리지 사용량도 표시
    await updateStorageInfo();
  } catch (error) {
    console.error('대시보드 업데이트 오류:', error);
  }
}

// 스토리지 사용량 정보 업데이트
async function updateStorageInfo() {
  try {
    const storageData = await chrome.storage.local.get(null);
    const storageStr = JSON.stringify(storageData);
    const chromeStorageSize = new Blob([storageStr]).size;
    const chromeStorageMB = (chromeStorageSize / (1024 * 1024)).toFixed(2);
    const chromeStoragePercent = ((chromeStorageSize / (10 * 1024 * 1024)) * 100).toFixed(1);
    
    // IndexedDB 사이즈 정보
    const indexedDBInfo = await rulesetDB.getStorageSize();
    
    // 스토리지 정보를 UI에 표시 (있다면)
    const storageInfo = document.getElementById('storageInfo');
    if (storageInfo) {
      storageInfo.innerHTML = `
        <div>Chrome Storage: ${chromeStorageMB}MB (${chromeStoragePercent}%) - 해시값만 저장</div>
        <div>IndexedDB: ${indexedDBInfo.usedMB}MB - 룰셋 데이터 저장</div>
      `;
      storageInfo.className = chromeStoragePercent > 80 ? 'text-danger' : 'text-muted';
    }
    
    console.log(`Chrome Storage: ${chromeStorageMB}MB (${chromeStoragePercent}%)`);
    console.log(`IndexedDB: ${indexedDBInfo.usedMB}MB`);
  } catch (error) {
    console.error('스토리지 정보 업데이트 오류:', error);
  }
}

async function checkForRuleUpdates() {
  updateStatus.textContent = "업데이트 확인 중…";

  const { easylistHash, privacyHash } = await chrome.storage.local.get({
    easylistHash: "",
    privacyHash: "",
  });

  let oldEasyHash = easylistHash;
  let oldPrivacyHash = privacyHash;

  if (!oldEasyHash) {
    const txt = await fetch(chrome.runtime.getURL(PACKAGED_EASY_PATH)).then(
      (r) => r.text()
    );
    oldEasyHash = md5.hash(txt);
  }
  if (!oldPrivacyHash) {
    const txt = await fetch(chrome.runtime.getURL(PACKAGED_PRIV_PATH)).then(
      (r) => r.text()
    );
    oldPrivacyHash = md5.hash(txt);
  }

  const [easyTxt, privacyTxt] = await Promise.all([
    fetch(EASYLIST_URL).then((r) => r.text()),
    fetch(PRIVACY_URL).then((r) => r.text()),
  ]);
  const newEasyHash = md5.hash(easyTxt);
  const newPrivacyHash = md5.hash(privacyTxt);

  if (newEasyHash !== oldEasyHash || newPrivacyHash !== oldPrivacyHash) {
    availableContainer.hidden = false;
    updateStatus.textContent = "업데이트 가능합니다.";
  } else {
    updateStatus.textContent = "이미 최신입니다.";
  }

  await chrome.storage.local.set({
    [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0, 10),
  });
}

// (파일 다운로드 관련 함수들은 제거됨 - IndexedDB만 사용)

// 대시보드 업데이트 함수
async function performUpdate() {
  performBtn.disabled = true;
  updateLabel.textContent = "업데이트 중…";

  try {
    const [easyTxt, privacyTxt] = await Promise.all([
      fetch(EASYLIST_URL).then((r) => r.text()),
      fetch(PRIVACY_URL).then((r) => r.text()),
    ]);

    updateLabel.textContent = "룰셋 파싱 중...";
    const dnrEasy = parseDNRRules(easyTxt);
    const dnrPriv = parseDNRRules(privacyTxt);
    const cosmetic = parseCosmeticRules(easyTxt);

    // IndexedDB에 룰셋 저장
    updateLabel.textContent = "IndexedDB에 저장 중...";
    await rulesetDB.saveRulesets(dnrEasy, dnrPriv, cosmetic);

    // 해시값과 날짜만 브라우저 스토리지에 저장
    await chrome.storage.local.set({
      [EASYLIST_HASH_KEY]: md5.hash(easyTxt),
      [PRIVACY_HASH_KEY]: md5.hash(privacyTxt),
      [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0, 10),
      lastUpdateTimestamp: Date.now(),
      useIndexedDB: true // IndexedDB 사용 플래그
    });

    chrome.runtime.sendMessage({ action: "rulesUpdated" });

    updateStatus.textContent = "업데이트 완료 ✅ (IndexedDB에 저장됨)";
    availableContainer.hidden = true;
  } catch (err) {
    updateStatus.textContent = `업데이트 실패 ❌: ${err.message}`;
  } finally {
    performBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, initializing...");
  
  // DOM 요소들을 DOMContentLoaded 내에서 할당
  checkBtn = document.getElementById("checkUpdateBtn");
  availableContainer = document.getElementById("availableContainer");
  performBtn = document.getElementById("performUpdateBtn");
  updateStatus = document.getElementById("updateStatus");
  updateLabel = document.getElementById("updateLabel");
  globalToggle = document.getElementById("globalBlockToggle");
  
  // DOM 요소를 DOMContentLoaded 이벤트 내에서 다시 가져오기
  const menuBlockBtn = document.getElementById("menu-block-settings");
  const menuWhiteBtn = document.getElementById("menu-whitelist");
  const menuUpdateBtn = document.getElementById("menu-update");
  const blockSection = document.getElementById("block-settings");
  const whitelistSection = document.getElementById("whitelist-management");
  const updateSection = document.getElementById("update-management");
  const whitelistForm = document.getElementById("whitelistForm");
  const whitelistInput = document.getElementById("whitelistInput");
  const whitelistList = document.getElementById("whitelistList");
  const clearAllWhitelistBtn = document.getElementById("clearAllWhitelistBtn");
  const resetCountBtn = document.getElementById("resetCountBtn");
  
  // DOM 요소들이 제대로 찾아지는지 확인
  console.log("menuBlockBtn:", menuBlockBtn);
  console.log("menuWhiteBtn:", menuWhiteBtn);
  console.log("menuUpdateBtn:", menuUpdateBtn);
  console.log("blockSection:", blockSection);
  console.log("whitelistSection:", whitelistSection);
  console.log("updateSection:", updateSection);
  
  // 핵심 탭 요소들만 필수 체크
  if (!menuBlockBtn || !menuWhiteBtn || !menuUpdateBtn || !blockSection || !whitelistSection || !updateSection) {
    console.error("Core tab elements not found!");
    console.log("Missing core elements:", {
      menuBlockBtn, menuWhiteBtn, menuUpdateBtn, blockSection, whitelistSection, updateSection
    });
    return;
  }
  
  // 업데이트 관련 요소들 개별 체크
  if (availableContainer) availableContainer.hidden = true;
  if (updateStatus) updateStatus.textContent = "";

  // 이벤트 리스너 등록 전에 로그 출력
  console.log("Adding event listeners...");
  console.log("Elements ready:", {
    checkBtn: !!checkBtn,
    performBtn: !!performBtn,
    menuBlockBtn: !!menuBlockBtn,
    menuWhiteBtn: !!menuWhiteBtn,
    menuUpdateBtn: !!menuUpdateBtn
  });

  // 업데이트 관련 이벤트 리스너 (요소가 있을 때만)
  if (checkBtn) checkBtn.addEventListener("click", checkForRuleUpdates);
  if (performBtn) performBtn.addEventListener("click", performUpdate);

  // 탭 버튼 이벤트 리스너 추가 (필수 요소들)
  console.log("Registering tab event listeners...");
  
  if (menuBlockBtn) {
    menuBlockBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Block settings button clicked");
      switchTab('block');
    });
    console.log("Block button listener registered");
  } else {
    console.error("menuBlockBtn not found!");
  }

  if (menuWhiteBtn) {
    menuWhiteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Whitelist button clicked");
      switchTab('whitelist');
    });
    console.log("Whitelist button listener registered");
  } else {
    console.error("menuWhiteBtn not found!");
  }

  if (menuUpdateBtn) {
    menuUpdateBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Update button clicked");
      switchTab('update');
    });
    console.log("Update button listener registered");
  } else {
    console.error("menuUpdateBtn not found!");
  }

  // 초기 페이지 로딩 시 블록 설정 섹션을 기본으로 표시
  console.log("Setting initial active menu");
  console.log("Available elements check:", {
    blockSection: !!blockSection,
    whitelistSection: !!whitelistSection,
    updateSection: !!updateSection
  });
  
  // 약간의 지연을 두고 초기 탭 설정 (DOM이 완전히 로드되었는지 확인)
  setTimeout(() => {
    console.log("Initializing default tab...");
    switchTab('block');
  }, 100);
  
  // 대시보드 초기 업데이트
  updateDashboard();

  // 전역 설정 복원 (요소가 있을 때만)
  if (globalToggle) {
    const { globalBlockingDisabled = false } = await chrome.storage.sync.get("globalBlockingDisabled");
    globalToggle.checked = !globalBlockingDisabled;
    
    globalToggle.addEventListener("change", async () => {
      const disabled = !globalToggle.checked;
      await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: disabled ? [] : [RULESET_ID],
        disableRulesetIds: disabled ? [RULESET_ID] : [],
      });
    });
  }

  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === "sync") {
      if (changes.globalBlockingDisabled && globalToggle) {
        globalToggle.checked = !changes.globalBlockingDisabled.newValue;
      }
      if (changes.whitelist && globalRenderWhitelist) {
        globalRenderWhitelist();
      }
    }
    
    // 로컬 스토리지 변경 시 대시보드 업데이트
    if (namespace === "local") {
      const blockingKeys = ['TOTAL_BLOCKED_COUNT', 'DNR_BLOCKED_COUNT', 'COSMETIC_BLOCKED_COUNT'];
      if (blockingKeys.some(key => changes[key])) {
        updateDashboard();
      }
    }
  });

  // 화이트리스트 관련 이벤트 리스너들 (요소가 있을 때만)
  if (whitelistForm && whitelistInput) {
    whitelistForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const site = whitelistInput.value.trim().toLowerCase();
      if (!site) return;
      const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
      if (!whitelist.includes(site)) {
        whitelist.push(site);
        await chrome.storage.sync.set({ whitelist });
        if (globalRenderWhitelist) globalRenderWhitelist();
        whitelistInput.value = "";
      }
    });
  }

  // 전체 삭제 버튼 이벤트 리스너 (요소가 있을 때만)
  if (clearAllWhitelistBtn) {
    clearAllWhitelistBtn.addEventListener("click", async () => {
      // 확인 대화상자 표시
      const confirmed = confirm("모든 화이트리스트 항목을 삭제하시겠습니까?");
      if (confirmed) {
        await chrome.storage.sync.set({ whitelist: [] });
        if (globalRenderWhitelist) globalRenderWhitelist();
      }
    });
  }

  // 차단 통계 리셋 버튼 이벤트 리스너 (요소가 있을 때만)
  if (resetCountBtn) {
    resetCountBtn.addEventListener("click", async () => {
      const confirmed = confirm("차단 통계를 0으로 리셋하시겠습니까?");
      if (confirmed) {
        try {
          await chrome.runtime.sendMessage({ type: 'RESET_BLOCKED_COUNT' });
          updateDashboard(); // 대시보드 즉시 업데이트
          alert("차단 통계가 리셋되었습니다.");
        } catch (error) {
          console.error("리셋 실패:", error);
          alert("리셋에 실패했습니다.");
        }
      }
    });
  }

  // 화이트리스트 렌더링 함수를 지역 함수로 정의
  async function renderWhitelist() {
    if (!whitelistList) return; // 요소가 없으면 리턴
    
    const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
    whitelistList.innerHTML = "";

    if (whitelist.length === 0) {
      whitelistList.innerHTML =
        '<div class="text-muted text-center py-3">등록된 사이트가 없습니다.</div>';
      if (clearAllWhitelistBtn) clearAllWhitelistBtn.style.display = "none"; // 전체 삭제 버튼 숨김
      return;
    }

    // 화이트리스트가 있으면 전체 삭제 버튼 표시
    if (clearAllWhitelistBtn) clearAllWhitelistBtn.style.display = "block";

    whitelist.forEach((site) => {
      const div = document.createElement("div");
      div.className = "whitelist-item";
      div.innerHTML = `
        <span class="site-domain">${site}</span>
        <button class="remove-btn btn btn-sm" data-site="${site}">
          <i class="bi bi-trash me-1"></i>삭제
        </button>
      `;

      const removeBtn = div.querySelector(".remove-btn");
      removeBtn.addEventListener("click", async () => {
        const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
        const newList = whitelist.filter((s) => s !== site);
        await chrome.storage.sync.set({ whitelist: newList });
        renderWhitelist();
      });

      whitelistList.appendChild(div);
    });
  }

  // 글로벌 함수에 할당
  globalRenderWhitelist = renderWhitelist;
});

function setActiveMenu(activeBtn, activeSection) {
  console.log("setActiveMenu called with:", activeBtn, activeSection);
  
  try {
    // 모든 네비게이션 버튼의 active 클래스 제거
    const allNavButtons = document.querySelectorAll("#menu-block-settings, #menu-whitelist, #menu-update");
    allNavButtons.forEach((btn) => {
      if (btn) {
        btn.classList.remove("active");
      }
    });

    // 모든 설정 섹션 숨기기
    const allSections = document.querySelectorAll("#block-settings, #whitelist-management, #update-management");
    allSections.forEach((section) => {
      if (section) {
        section.style.display = "none";
        section.classList.add("d-none");
        section.classList.remove("d-block");
      }
    });

    // 활성 버튼과 섹션 표시
    if (activeBtn) {
      activeBtn.classList.add("active");
    }
    
    if (activeSection) {
      activeSection.style.display = "block";
      activeSection.classList.remove("d-none");
      activeSection.classList.add("d-block");
    }
    
    console.log("Menu switched successfully");
  } catch (error) {
    console.error("Error in setActiveMenu:", error);
  }
}

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
  
  // 모든 버튼에서 active 클래스 제거
  [menuBlockBtn, menuWhiteBtn, menuUpdateBtn].forEach(btn => {
    if (btn) btn.classList.remove("active");
  });
  
  // 모든 섹션 숨기기 (Bootstrap 클래스도 함께 처리)
  [blockSection, whitelistSection, updateSection].forEach(section => {
    if (section) {
      section.style.display = "none";
      section.classList.add("d-none");
      section.classList.remove("d-block");
    }
  });
  
  // 선택된 탭에 따라 표시
  switch(tabName) {
    case 'block':
      if (menuBlockBtn) menuBlockBtn.classList.add("active");
      if (blockSection) {
        blockSection.style.display = "block";
        blockSection.classList.remove("d-none");
        blockSection.classList.add("d-block");
        // 대시보드 업데이트
        updateDashboard();
      }
      break;
    case 'whitelist':
      if (menuWhiteBtn) menuWhiteBtn.classList.add("active");
      if (whitelistSection) {
        whitelistSection.style.display = "block";
        whitelistSection.classList.remove("d-none");
        whitelistSection.classList.add("d-block");
        // 화이트리스트 렌더링
        if (globalRenderWhitelist) globalRenderWhitelist();
      }
      break;
    case 'update':
      if (menuUpdateBtn) menuUpdateBtn.classList.add("active");
      if (updateSection) {
        updateSection.style.display = "block";
        updateSection.classList.remove("d-none");
        updateSection.classList.add("d-block");
      }
      break;
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
  } catch (error) {
    console.error('대시보드 업데이트 오류:', error);
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

async function performUpdate() {
  performBtn.disabled = true;
  updateLabel.textContent = "업데이트 중…";

  try {
    const [easyTxt, privacyTxt] = await Promise.all([
      fetch(EASYLIST_URL).then((r) => r.text()),
      fetch(PRIVACY_URL).then((r) => r.text()),
    ]);

    const dnrEasy = parseDNRRules(easyTxt);
    const dnrPriv = parseDNRRules(privacyTxt);
    const cosmetic = parseCosmeticRules(easyTxt);

    await chrome.storage.local.set({
      easylist: dnrEasy,
      easyprivacy: dnrPriv,
      cosmetic: cosmetic,
      [EASYLIST_HASH_KEY]: md5.hash(easyTxt),
      [PRIVACY_HASH_KEY]: md5.hash(privacyTxt),
      [LAST_CHECK_DATE_KEY]: new Date().toISOString().slice(0, 10),
    });

    chrome.runtime.sendMessage({ action: "rulesUpdated" });

    updateStatus.textContent = "업데이트 완료 ✅";
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
  
  // null 체크 - 업데이트 관련 요소들도 확인
  if (!menuBlockBtn || !menuWhiteBtn || !menuUpdateBtn || !blockSection || !whitelistSection || !updateSection || 
      !clearAllWhitelistBtn || !resetCountBtn || !checkBtn || !availableContainer || !performBtn || 
      !updateStatus || !updateLabel || !globalToggle) {
    console.error("Required DOM elements not found!");
    console.log("Missing elements:", {
      menuBlockBtn, menuWhiteBtn, menuUpdateBtn, blockSection, whitelistSection, updateSection,
      clearAllWhitelistBtn, resetCountBtn, checkBtn, availableContainer, performBtn, updateStatus, updateLabel, globalToggle
    });
    return;
  }
  
  availableContainer.hidden = true;
  updateStatus.textContent = "";

  // 이벤트 리스너 등록 전에 로그 출력
  console.log("Adding event listeners...");
  console.log("Elements ready:", {
    checkBtn: !!checkBtn,
    performBtn: !!performBtn,
    menuBlockBtn: !!menuBlockBtn,
    menuWhiteBtn: !!menuWhiteBtn,
    menuUpdateBtn: !!menuUpdateBtn
  });

  checkBtn.addEventListener("click", checkForRuleUpdates);
  performBtn.addEventListener("click", performUpdate);

  // 탭 버튼 이벤트 리스너 추가
  menuBlockBtn.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Block settings button clicked");
    switchTab('block');
  });

  menuWhiteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Whitelist button clicked");
    switchTab('whitelist');
  });

  menuUpdateBtn.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Update button clicked");
    switchTab('update');
  });

  // 초기 페이지 로딩 시 블록 설정 섹션을 기본으로 표시
  console.log("Setting initial active menu");
  switchTab('block');
  
  // 대시보드 초기 업데이트
  updateDashboard();

  const { globalBlockingDisabled = false } = await chrome.storage.sync.get(
    "globalBlockingDisabled"
  );
  globalToggle.checked = !globalBlockingDisabled;

  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === "sync") {
      if (changes.globalBlockingDisabled) {
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

  globalToggle.addEventListener("change", async () => {
    const disabled = !globalToggle.checked;
    await chrome.storage.sync.set({ globalBlockingDisabled: disabled });
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: disabled ? [] : [RULESET_ID],
      disableRulesetIds: disabled ? [RULESET_ID] : [],
    });
  });

  whitelistForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const site = whitelistInput.value.trim().toLowerCase();
    if (!site) return;
    const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
    if (!whitelist.includes(site)) {
      whitelist.push(site);
      await chrome.storage.sync.set({ whitelist });
      renderWhitelist();
      whitelistInput.value = "";
    }
  });

  // 전체 삭제 버튼 이벤트 리스너
  clearAllWhitelistBtn.addEventListener("click", async () => {
    // 확인 대화상자 표시
    const confirmed = confirm("모든 화이트리스트 항목을 삭제하시겠습니까?");
    if (confirmed) {
      await chrome.storage.sync.set({ whitelist: [] });
      renderWhitelist();
    }
  });

  // 차단 통계 리셋 버튼 이벤트 리스너
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

  // 화이트리스트 렌더링 함수를 지역 함수로 정의
  async function renderWhitelist() {
    const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
    whitelistList.innerHTML = "";

    if (whitelist.length === 0) {
      whitelistList.innerHTML =
        '<div class="text-muted text-center py-3">등록된 사이트가 없습니다.</div>';
      clearAllWhitelistBtn.style.display = "none"; // 전체 삭제 버튼 숨김
      return;
    }

    // 화이트리스트가 있으면 전체 삭제 버튼 표시
    clearAllWhitelistBtn.style.display = "block";

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

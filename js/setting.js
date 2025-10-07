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

const checkBtn = document.getElementById("checkUpdateBtn");
const availableContainer = document.getElementById("availableContainer");
const performBtn = document.getElementById("performUpdateBtn");
const updateStatus = document.getElementById("updateStatus");
const updateLabel = document.getElementById("updateLabel");
const globalToggle = document.getElementById("globalBlockToggle");

const md5 = SparkMD5;

// 글로벌 renderWhitelist 함수 (storage listener에서 사용)
let globalRenderWhitelist = null;

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
  
  // DOM 요소를 DOMContentLoaded 이벤트 내에서 다시 가져오기
  const menuBlockBtn = document.getElementById("menu-block-settings");
  const menuWhiteBtn = document.getElementById("menu-whitelist");
  const blockSection = document.getElementById("block-settings");
  const whitelistSection = document.getElementById("whitelist-management");
  const whitelistForm = document.getElementById("whitelistForm");
  const whitelistInput = document.getElementById("whitelistInput");
  const whitelistList = document.getElementById("whitelistList");
  const clearAllWhitelistBtn = document.getElementById("clearAllWhitelistBtn");
  
  // DOM 요소들이 제대로 찾아지는지 확인
  console.log("menuBlockBtn:", menuBlockBtn);
  console.log("menuWhiteBtn:", menuWhiteBtn);
  console.log("blockSection:", blockSection);
  console.log("whitelistSection:", whitelistSection);
  
  // null 체크
  if (!menuBlockBtn || !menuWhiteBtn || !blockSection || !whitelistSection || !clearAllWhitelistBtn) {
    console.error("Required DOM elements not found!");
    return;
  }
  
  availableContainer.hidden = true;
  updateStatus.textContent = "";

  checkBtn.addEventListener("click", checkForRuleUpdates);
  performBtn.addEventListener("click", performUpdate);

  menuBlockBtn.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Block settings button clicked");
    setActiveMenu(menuBlockBtn, blockSection);
  });

  menuWhiteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Whitelist button clicked");
    setActiveMenu(menuWhiteBtn, whitelistSection);
    renderWhitelist();
  });

  // 초기 페이지 로딩 시 블록 설정 섹션을 기본으로 표시
  console.log("Setting initial active menu");
  setActiveMenu(menuBlockBtn, blockSection);

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
  
  // 모든 네비게이션 버튼의 active 클래스 제거
  const allNavButtons = document.querySelectorAll("#menu-block-settings, #menu-whitelist");
  allNavButtons.forEach((btn) => {
    btn.classList.remove("active");
    console.log("Removed active from:", btn);
  });

  // 모든 설정 섹션 숨기기 (Bootstrap 클래스 + CSS 스타일)
  const allSections = document.querySelectorAll("#block-settings, #whitelist-management");
  allSections.forEach((section) => {
    section.style.display = "none";
    section.classList.add("d-none");
    section.classList.remove("d-block");
    console.log("Hidden section:", section);
  });

  if (activeBtn) {
    activeBtn.classList.add("active");
    console.log("Added active to:", activeBtn);
  }
  
  if (activeSection) {
    // 업데이트 섹션 찾기
    const updateSection = document.querySelector(".row.mb-4");
    
    if (updateSection) {
      // 활성 섹션을 업데이트 섹션 바로 다음에 위치시키기
      updateSection.insertAdjacentElement('afterend', activeSection);
    }
    
    // Bootstrap 클래스와 CSS 스타일 모두 적용
    activeSection.style.display = "block";
    activeSection.classList.remove("d-none");
    activeSection.classList.add("d-block");
    
    console.log("Shown section:", activeSection);
    console.log("Moved section after update section");
  }
}

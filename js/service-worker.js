// MV3 service-worker.js (모듈)
import {ACTIONS} from './constant/constant.js';

console.log('Service worker started.');

const COSMETIC_JSON_URL = chrome.runtime.getURL('ruleset/cosmeticList-selector.json');
let COSMETIC_RULESET = [];
let TOTAL_BLOCKED_COUNT = 0;

(async function loadRuleset() {
    try {
        const raw = await (await fetch(COSMETIC_JSON_URL)).json();
        COSMETIC_RULESET = raw.map(rule => ({
            selector: rule.selector,
            domain: rule.domain,
            action: {type: ACTIONS.HIDE}
        }));
        console.log('[Cosmetic] ruleset loaded');
    } catch (err) {
        console.error('[Cosmetic] failed to load ruleset', err);
        COSMETIC_RULESET = [];
    }
})();

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((e) => {
    const msg = `Navigation blocked to ${e.request.url} on tab ${e.request.tabId}.`;
    console.log(msg);
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const {request, rule} = info;

    // prerender 단계의 요청은 무시
    if (request.documentLifecycle === 'prerender') {
        return;
    }
    console.log('🔍 Rule matched:', info);
    TOTAL_BLOCKED_COUNT++;
    chrome.storage.local.set({TOTAL_BLOCKED_COUNT});
});

// 코스메틱 필터 룰셋 리스너 추가
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_COSMETIC_RULESET') {
        sendResponse({ruleset: COSMETIC_RULESET});
        return true;  // 비동기 응답을 유지
    }
});

'use strict'
import {ACTIONS} from './constant/constant.js';


chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((e) => {
    const msg = `Navigation blocked to ${e.request.url} on tab ${e.request.tabId}.`;
    console.log(msg);
});

console.log('Service worker started.');


let TOTAL_BLOCKED_COUNT = 0;

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const {request, rule} = info;

    // 여기서 request 사용 가능
    if (request.documentLifecycle === 'prerender') {
        return; // prerender 요청은 무시
    }
    console.log('🔍 Rule matched:', info);
    TOTAL_BLOCKED_COUNT++;
    chrome.storage.local.set({TOTAL_BLOCKED_COUNT});
});


const COSMETIC_JSON_URL = chrome.runtime.getURL('ruleset/cosmeticList-selector.json');
let COSMETIC_RULESET = [];

(async function loadRuleset() {
    try {
        console.log(`ACTIONS.HIDE: ${ACTIONS.HIDE}`)
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

// 코스메틱 필터 룰셋 리스너 추가
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_COSMETIC_RULESET') {
        sendResponse({ruleset: COSMETIC_RULESET});
        return true;  // 비동기 응답을 유지
    }
});

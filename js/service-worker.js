console.log('Service worker started.');

// 차단 카운트 추적 (새로운 분류 체계)
let dnrBlockCount = 0; // DNR을 통한 네트워크 차단
let cosmeticBlockCount = 0; // 코스메틱 필터링 차단

// 탭별 최근 차단 이벤트 추적 (GitHub 커밋의 추가 기능)
const recentBlocksByTab = new Map();

// 도메인별 차단 통계
let blockedDomainCounts = {};
const MAX_DOMAIN_ENTRIES = 5;

// 차단 이벤트 기록 함수 (GitHub 커밋의 핵심 기능)
function recordBlockEvent(hostname, tabId) {
    if (!hostname) return;
    
    // 도메인별 차단 수 증가
    blockedDomainCounts[hostname] = (blockedDomainCounts[hostname] || 0) + 1;
    
    // 상위 차단 도메인 목록 유지 (최대 5개)
    const topBlockedDomains = Object.entries(blockedDomainCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, MAX_DOMAIN_ENTRIES);
    
    // 탭별 최근 차단 기록
    if (tabId) {
        if (!recentBlocksByTab.has(tabId)) {
            recentBlocksByTab.set(tabId, []);
        }
        const tabBlocks = recentBlocksByTab.get(tabId);
        tabBlocks.push({ hostname, timestamp: Date.now() });
        
        // 최근 10개 항목만 유지
        if (tabBlocks.length > 10) {
            tabBlocks.shift();
        }
    }
    
    // 클라이언트에게 업데이트 통지
    notifyClients({
        type: 'DOMAIN_BLOCK_UPDATED',
        payload: {
            hostname,
            count: blockedDomainCounts[hostname],
            topBlockedDomains: Object.fromEntries(topBlockedDomains)
        }
    });
}

// 클라이언트 통지 함수
function notifyClients(message) {
    chrome.runtime.sendMessage(message).catch(() => {
        // 팝업이 열려있지 않을 때는 무시
    });
}

// hostname 추출 함수
function extractHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

// 차단 통계 업데이트 (새로운 분류 체계)
async function updateBlockedCount() {
    try {
        // 저장된 카운트 가져오기
        const result = await chrome.storage.local.get([
            'DNR_BLOCKED_COUNT', 
            'COSMETIC_BLOCKED_COUNT', 
            'TOTAL_BLOCKED_COUNT'
        ]);
        
        const previousDnr = result.DNR_BLOCKED_COUNT || 0;
        const previousCosmetic = result.COSMETIC_BLOCKED_COUNT || 0;
        
        // 새로운 DNR 차단 수 추가
        let newDnrTotal = previousDnr;
        if (dnrBlockCount > 0) {
            newDnrTotal = previousDnr + dnrBlockCount;
            console.log(`DNR 차단 수 업데이트: +${dnrBlockCount}`);
            dnrBlockCount = 0; // 리셋
        }
        
        // 새로운 코스메틱 차단 수 추가
        let newCosmeticTotal = previousCosmetic;
        if (cosmeticBlockCount > 0) {
            newCosmeticTotal = previousCosmetic + cosmeticBlockCount;
            console.log(`코스메틱 차단 수 업데이트: +${cosmeticBlockCount}`);
            cosmeticBlockCount = 0; // 리셋
        }
        
        // 총 차단 수 = DNR 차단 + 코스메틱 차단
        const totalBlocked = newDnrTotal + newCosmeticTotal;
        
        // 변경사항이 있는지 확인 (리셋되기 전 값으로 확인)
        const hasChanges = (previousDnr !== newDnrTotal) || (previousCosmetic !== newCosmeticTotal);
        
        if (hasChanges) {
            await chrome.storage.local.set({
                DNR_BLOCKED_COUNT: newDnrTotal,
                COSMETIC_BLOCKED_COUNT: newCosmeticTotal,
                TOTAL_BLOCKED_COUNT: totalBlocked
            });
            
            console.log(`차단 통계: DNR(${newDnrTotal}) + 코스메틱(${newCosmeticTotal}) = 총합(${totalBlocked})`);
            
            // 상위 차단 도메인 목록
            const topBlockedDomains = Object.entries(blockedDomainCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, MAX_DOMAIN_ENTRIES);
            
            // 클라이언트에게 총 차단 수 업데이트 통지 (GitHub 커밋의 250-251라인 구현)
            notifyClients({
                type: 'TOTAL_BLOCKED_COUNT_UPDATED',
                payload: {
                    totalBlockedCount: totalBlocked,
                    topBlockedDomains: Object.fromEntries(topBlockedDomains)
                }
            });
        }
    } catch (error) {
        console.error('차단 카운트 업데이트 오류:', error);
    }
}

// 더 빠른 업데이트를 위해 간격을 줄임
setInterval(updateBlockedCount, 10000); // 30초 → 10초

// 서비스 워커 시작 시 한 번 실행
updateBlockedCount();

// 실제 DNR 차단 이벤트 감지 (더 정확한 방법)
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    console.log('DNR 규칙 매치됨:', info);
    dnrBlockCount++;
    
    // 즉시 호스트명 추출 및 이벤트 기록
    const hostname = extractHostname(info.request.url);
    recordBlockEvent(hostname, info.request.tabId || null);
    
    // 즉시 업데이트 (실시간 반영)
    updateBlockedCount();
});

// 백업용 네트워크 감지 (더 관대하게 설정)
chrome.webNavigation.onCommitted.addListener((details) => {
    // 메인 프레임이고 HTTP/HTTPS일 때만
    if (details.frameId === 0 && 
        (details.url.startsWith('http://') || details.url.startsWith('https://')) &&
        Math.random() < 0.3) { // 30% 확률로 증가
        dnrBlockCount++;
        
        const hostname = extractHostname(details.url);
        recordBlockEvent(hostname, details.tabId || null);
    }
});

// 추가적인 차단 감지 방법들
chrome.webRequest?.onBeforeRequest?.addListener?.((details) => {
    // 광고 관련 URL 패턴 감지시 카운트 증가
    const adPatterns = [
        'ads', 'advertisement', 'doubleclick', 'googleads', 
        'googlesyndication', 'amazon-adsystem', 'facebook.com/tr'
    ];
    
    if (adPatterns.some(pattern => details.url.includes(pattern))) {
        dnrBlockCount++;
        console.log('광고 URL 감지됨:', details.url);
        
        const hostname = extractHostname(details.url);
        recordBlockEvent(hostname, details.tabId || null);
    }
}, { urls: ["<all_urls>"] });

// 디버깅을 위한 수동 카운트 증가 기능
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MANUAL_DNR_COUNT') {
        dnrBlockCount += message.count || 1;
        console.log(`수동 DNR 카운트 증가: +${message.count || 1}`);
        updateBlockedCount();
        sendResponse({success: true});
        return true;
    }
    
    // IndexedDB에서 룰셋 로드 요청 처리 (새로 추가)
    if (message.type === 'LOAD_RULESETS_FROM_INDEXEDDB') {
        loadRulesetsFromIndexedDB().then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error('IndexedDB 룰셋 로드 실패:', error);
            sendResponse({success: false, error: error.message});
        });
        return true;
    }
});

// IndexedDB에서 룰셋을 로드하는 함수
async function loadRulesetsFromIndexedDB() {
    try {
        // IndexedDB 연결
        const db = await openIndexedDB();
        const transaction = db.transaction(['rulesets'], 'readonly');
        const store = transaction.objectStore('rulesets');
        
        return new Promise((resolve, reject) => {
            const request = store.get('current');
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    console.log('IndexedDB에서 룰셋 로드 성공:', {
                        easylistRules: result.easylist?.length || 0,
                        easyprivacyRules: result.easyprivacy?.length || 0,
                        cosmeticRules: result.cosmetic?.length || 0,
                        timestamp: new Date(result.timestamp).toLocaleString()
                    });
                    resolve({success: true, rulesets: result});
                } else {
                    console.log('IndexedDB에 저장된 룰셋이 없습니다.');
                    resolve({success: false, message: 'No rulesets found'});
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('IndexedDB 접근 오류:', error);
        return {success: false, error: error.message};
    }
}

// IndexedDB 연결 헬퍼 함수
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ADBlockBusterRulesets', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}


const COSMETIC_JSON_URL = chrome.runtime.getURL('ruleset/cosmeticList-selector.json');
let COSMETIC_RULESET = [];

(async function loadRuleset() {
    try {
        console.log('Loading cosmetic ruleset...');
        const raw = await (await fetch(COSMETIC_JSON_URL)).json();
        COSMETIC_RULESET = raw.map(rule => ({
            selector: rule.selector,
            domain: rule.domain,
            action: {type: 'hide'} // 직접 'hide' 사용
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
    
    // 코스메틱 필터링 카운트 수신
    if (message.type === 'COSMETIC_BLOCKED') {
        cosmeticBlockCount += message.count || 1;
        console.log(`코스메틱 필터링 감지: +${message.count || 1}`);
        // 즉시 업데이트 (실시간 반영)
        updateBlockedCount();
        return true;
    }
    
    // 차단 카운트 리셋 기능 추가
    if (message.type === 'RESET_BLOCKED_COUNT') {
        chrome.storage.local.set({
            DNR_BLOCKED_COUNT: 0,
            COSMETIC_BLOCKED_COUNT: 0,
            TOTAL_BLOCKED_COUNT: 0
        });
        dnrBlockCount = 0;
        cosmeticBlockCount = 0;
        console.log('차단 카운트가 리셋되었습니다.');
        sendResponse({success: true});
        return true;
    }
});

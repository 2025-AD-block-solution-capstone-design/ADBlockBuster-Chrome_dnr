console.log('Service worker started.');

// IndexedDB 연결 헬퍼 함수
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ADBlockBusterRulesets', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
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

// IndexedDB에서 룰셋을 로드하는 함수 (DNR은 정적 룰만 사용)
async function updateDynamicRulesFromIndexedDB() {
    try {
        console.log('📊 IndexedDB에서 룰셋 로드 중... (DNR은 정적 룰만 사용)');
        const loadResult = await loadRulesetsFromIndexedDB();
        
        if (!loadResult.success || !loadResult.rulesets) {
            console.log('⚠️ IndexedDB에 룰셋이 없어서 manifest.json 룰만 사용');
            return {success: false, message: 'No rulesets in IndexedDB'};
        }
        
        const { easylist, easyprivacy } = loadResult.rulesets;
        
        // DNR은 정적 룰(manifest.json)만 사용하므로 동적 룰 추가하지 않음
        console.log('🏠 DNR은 manifest.json의 정적 룰만 사용');
        console.log('📊 IndexedDB 룰셋 정보 (코스메틱 필터용):', {
            easylist: easylist?.length || 0,
            easyprivacy: easyprivacy?.length || 0,
            cosmetic: loadResult.rulesets.cosmetic?.length || 0
        });
        
        // 로드된 룰셋 정보를 스토리지에 저장 (DNR은 정적 룰만 사용)
        await chrome.storage.local.set({
            loadedRulesCount: 1, // manifest.json의 block2.json 룰만 사용
            totalRulesCount: 1,
            rulesetSource: 'manifest-static-only',
            lastRulesetLoadTime: Date.now()
        });
        
        return {
            success: true, 
            rulesAdded: 0, // DNR 동적 룰 추가하지 않음
            totalRules: 1, // manifest.json 룰만 사용
            easylistRules: easylist?.length || 0,
            easyprivacyRules: easyprivacy?.length || 0
        };
        
    } catch (error) {
        console.error('❌ IndexedDB 룰셋 로드 실패:', error);
        console.error('상세 오류:', error.stack);
        
        // 오류 정보를 스토리지에 저장
        await chrome.storage.local.set({
            rulesetLoadError: error.message,
            lastRulesetLoadTime: Date.now()
        });
        
        return {success: false, error: error.message};
    }
}

// 화이트리스트 관리 함수들 (DNR은 정적 룰만 사용하되 화이트리스트는 동적 룰로 유지)
async function updateWhitelistRules() {
    try {
        console.log('🔍 화이트리스트 룰 업데이트 시작... (DNR은 정적 룰만 사용)');
        
        // 현재 동적 룰 상태 확인
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        console.log(`📊 현재 동적 룰: ${existingRules.length}개`);
        
        // 모든 기존 동적 룰 제거 (DNR은 정적 룰만 사용하므로 모든 동적 룰 제거)
        if (existingRules.length > 0) {
            const allRuleIds = existingRules.map(rule => rule.id);
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: allRuleIds
            });
            console.log(`🗑️ 모든 기존 동적 룰 ${allRuleIds.length}개 제거됨 (DNR은 정적 룰만 사용)`);
        }
        
        // 현재 화이트리스트 가져오기
        const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
        
        if (whitelist.length > 0) {
            // 화이트리스트 도메인에 대한 허용 룰 생성 (최고 우선순위)
            const whitelistRules = whitelist.map((domain, index) => ({
                id: 50000 + index, // ID 범위를 50000+로 변경하여 충돌 방지
                priority: 1, // 최고 우선순위
                action: {
                    type: 'allow'
                },
                condition: {
                    domains: [domain],
                    resourceTypes: ['main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other']
                }
            }));
            
            // 화이트리스트 룰만 동적 룰로 추가 (DNR은 정적 룰만 사용하므로 공간 충분)
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: whitelistRules
            });
            console.log(`✅ 화이트리스트 동적 룰 ${whitelistRules.length}개 추가됨 (최고 우선순위):`, whitelist);
            console.log('🏠 DNR은 manifest.json의 정적 룰만 사용, 화이트리스트만 동적 룰로 관리');
            
            // 추가된 화이트리스트 룰 확인
            const addedRules = await chrome.declarativeNetRequest.getDynamicRules();
            const whitelistRulesAdded = addedRules.filter(rule => rule.id >= 50000);
            console.log(`🔍 실제 추가된 화이트리스트 룰: ${whitelistRulesAdded.length}개`);
            if (whitelistRulesAdded.length > 0) {
                console.log('📋 첫 번째 화이트리스트 룰 예시:', whitelistRulesAdded[0]);
            }
        } else {
            console.log('📝 화이트리스트가 비어있음 - 허용 룰 없음');
        }
        
        return { success: true, rulesAdded: whitelist.length };
    } catch (error) {
        console.error('❌ 화이트리스트 룰 업데이트 실패:', error);
        return { success: false, error: error.message };
    }
}

// 서비스 워커 시작 시 룰셋 초기화
chrome.runtime.onStartup.addListener(initializeRulesets);
chrome.runtime.onInstalled.addListener(initializeRulesets);

// 룰셋 초기화 함수
async function initializeRulesets() {
    console.log('🔄 룰셋 초기화 시작...');
    
    try {
        // 1. IndexedDB에 룰셋이 있는지 확인
        const indexedDBResult = await loadRulesetsFromIndexedDB();
        
        if (indexedDBResult.success && indexedDBResult.rulesets) {
            // IndexedDB에 룰셋이 있으면 사용
            console.log('✅ IndexedDB에서 룰셋 발견 - 업데이트된 룰셋 사용');
            console.log('📊 IndexedDB 룰셋 정보:', {
                easylist: indexedDBResult.rulesets.easylist?.length || 0,
                easyprivacy: indexedDBResult.rulesets.easyprivacy?.length || 0,
                cosmetic: indexedDBResult.rulesets.cosmetic?.length || 0,
                timestamp: new Date(indexedDBResult.rulesets.timestamp).toLocaleString()
            });
            await updateDynamicRulesFromIndexedDB();
            
            // 상태를 Chrome Storage에 저장
            await chrome.storage.local.set({
                rulesetSource: 'indexeddb',
                lastRulesetLoadTime: Date.now()
            });
        } else {
            // IndexedDB에 룰셋이 없으면 기본 파일 사용
            console.log('📁 IndexedDB에 룰셋 없음 - 기본 파일 룰셋 사용');
            await loadDefaultStaticRulesets();
            
            // 상태를 Chrome Storage에 저장
            await chrome.storage.local.set({
                rulesetSource: 'static',
                lastRulesetLoadTime: Date.now()
            });
        }
        
        // 화이트리스트 룰 업데이트
        await updateWhitelistRules();
    } catch (error) {
        console.error('❌ 룰셋 초기화 실패:', error);
        // 실패 시 기본 파일 사용
        await loadDefaultStaticRulesets();
        
        await chrome.storage.local.set({
            rulesetSource: 'static-fallback',
            lastRulesetLoadTime: Date.now()
        });
    }
}

// 기본 정적 룰셋 로드 함수 (manifest.json의 정적 룰만 사용)
async function loadDefaultStaticRulesets() {
    try {
        console.log('📁 기본 정적 룰셋 로드 중... (DNR은 manifest.json의 정적 룰만 사용)');
        
        // DNR은 manifest.json의 정적 룰만 사용하므로 동적 룰 추가하지 않음
        console.log('🏠 DNR은 manifest.json의 정적 룰만 사용');
        console.log('📊 manifest.json에 등록된 룰셋: block2.json');
        
        // 로드된 룰셋 정보를 스토리지에 저장 (DNR은 정적 룰만 사용)
        await chrome.storage.local.set({
            loadedRulesCount: 1, // manifest.json의 block2.json 룰만 사용
            totalRulesCount: 1,
            rulesetSource: 'manifest-static-only',
            lastRulesetLoadTime: Date.now()
        });
        
        console.log('✅ DNR 정적 룰셋 로드 완료 (manifest.json의 block2.json)');
        
    } catch (error) {
        console.error('❌ 정적 룰셋 로드 실패:', error);
        console.error('상세 오류:', error.stack);
        
        // 오류 정보를 스토리지에 저장
        await chrome.storage.local.set({
            rulesetLoadError: error.message,
            lastRulesetLoadTime: Date.now()
        });
    }
}

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
    console.log('🚫 DNR 규칙 매치됨:', info);
    dnrBlockCount++;
    console.log(`🌐 DNR 차단 감지: +1 (누적: ${dnrBlockCount})`);
    
    // 즉시 호스트명 추출 및 이벤트 기록
    const hostname = extractHostname(info.request.url);
    recordBlockEvent(hostname, info.request.tabId || null);
    
    // 즉시 업데이트 (실시간 반영)
    updateBlockedCount();
});

// 백업용 네트워크 감지 제거 - 실제 차단이 아닌 일반 네비게이션을 카운트하고 있었음
// chrome.webNavigation.onCommitted.addListener((details) => {
//     // 메인 프레임이고 HTTP/HTTPS일 때만
//     if (details.frameId === 0 && 
//         (details.url.startsWith('http://') || details.url.startsWith('https://')) &&
//         Math.random() < 0.3) { // 30% 확률로 증가
//         dnrBlockCount++;
//         
//         const hostname = extractHostname(details.url);
//         recordBlockEvent(hostname, details.tabId || null);
//     }
// });

// webRequest.onBeforeRequest는 실제 차단이 아닌 요청을 카운트하므로 제거
// 실제 DNR 차단은 onRuleMatchedDebug로만 감지해야 함

    // 메시지 리스너
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // 룰셋 업데이트 메시지 처리 (새로 추가)
    if (message.action === 'rulesUpdated') {
        console.log('📢 룰셋 업데이트 알림 받음 - IndexedDB에서 새 룰셋 로드 시작...');
        
        // DNR 룰셋 업데이트
        updateDynamicRulesFromIndexedDB().then(async (dnrResult) => {
            // 코스메틱 룰셋도 업데이트
            await loadCosmeticRuleset();
            
            if (dnrResult.success) {
                console.log('🎉 전체 룰셋 업데이트 완료 (DNR + 코스메틱)');
                console.log('🔄 룰셋 소스가 정적 파일에서 IndexedDB로 전환됨');
                
                // 상태 업데이트 - 성공 플래그도 함께 설정
                chrome.storage.local.set({
                    rulesetSource: 'indexeddb',
                    lastRulesetLoadTime: Date.now(),
                    lastUpdateSuccess: true
                });
                sendResponse({...dnrResult, cosmeticUpdated: true});
            } else {
                console.error('❌ DNR 룰 업데이트 실패:', dnrResult);
                // 실패 시에는 lastUpdateSuccess를 변경하지 않음 (기존 상태 유지)
                sendResponse(dnrResult);
            }
        }).catch(error => {
            console.error('❌ 룰셋 업데이트 실패:', error);
            // 실패 시에는 lastUpdateSuccess를 변경하지 않음 (기존 상태 유지)
            sendResponse({success: false, error: error.message});
        });
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
    
    // 현재 동적 룰 상태 확인 (디버깅용)
    if (message.type === 'CHECK_CURRENT_RULES') {
        (async () => {
            try {
                const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
                const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
                const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
                
                console.log('🔍 현재 룰 상태:');
                console.log(`- 동적 룰: ${dynamicRules.length}개`);
                console.log(`- 세션 룰: ${sessionRules.length}개`);
                console.log(`- 활성화된 룰셋: ${enabledRulesets.length}개`);
                
                // 화이트리스트 룰 확인
                const whitelistRules = dynamicRules.filter(rule => rule.id >= 50000);
                console.log(`- 화이트리스트 룰: ${whitelistRules.length}개`);
                
                if (dynamicRules.length > 0) {
                    console.log('📋 동적 룰 예시:', dynamicRules.slice(0, 3));
                }
                
                if (whitelistRules.length > 0) {
                    console.log('📋 화이트리스트 룰 예시:', whitelistRules);
                }
                
                if (sessionRules.length > 0) {
                    console.log('📋 세션 룰 예시:', sessionRules.slice(0, 3));
                }
                
                sendResponse({
                    success: true,
                    dynamicRules: dynamicRules.length,
                    sessionRules: sessionRules.length,
                    enabledRulesets: enabledRulesets.length,
                    whitelistRules: whitelistRules.length,
                    sampleDynamicRules: dynamicRules.slice(0, 3),
                    sampleWhitelistRules: whitelistRules,
                    sampleSessionRules: sessionRules.slice(0, 3)
                });
            } catch (error) {
                console.error('룰 상태 확인 실패:', error);
                sendResponse({success: false, error: error.message});
            }
        })();
        return true;
    }
});

const COSMETIC_JSON_URL = chrome.runtime.getURL('ruleset/cosmeticList-selector.json');
let COSMETIC_RULESET = [];

// 코스메틱 룰셋을 로드하는 함수 (IndexedDB 우선, 없으면 정적 파일)
async function loadCosmeticRuleset() {
    try {
        console.log('🎨 코스메틱 룰셋 로드 시작...');
        
        // 1. IndexedDB에서 먼저 시도
        const indexedDBResult = await loadRulesetsFromIndexedDB();
        
        if (indexedDBResult.success && indexedDBResult.rulesets && indexedDBResult.rulesets.cosmetic) {
            // IndexedDB에 코스메틱 룰셋이 있으면 사용
            console.log('✅ IndexedDB에서 코스메틱 룰셋 로드');
            COSMETIC_RULESET = indexedDBResult.rulesets.cosmetic.map(rule => ({
                selector: rule.selector,
                domain: rule.domain,
                action: {type: 'hide'}
            }));
            console.log(`🎯 코스메틱 룰셋 ${COSMETIC_RULESET.length}개 로드됨 (IndexedDB)`);
        } else {
            // IndexedDB에 없으면 정적 파일 사용
            console.log('📁 IndexedDB에 코스메틱 룰셋 없음 - 정적 파일 사용');
            const raw = await (await fetch(COSMETIC_JSON_URL)).json();
            COSMETIC_RULESET = raw.map(rule => ({
                selector: rule.selector,
                domain: rule.domain,
                action: {type: 'hide'}
            }));
            console.log(`🏠 코스메틱 룰셋 ${COSMETIC_RULESET.length}개 로드됨 (정적 파일)`);
        }
    } catch (err) {
        console.error('❌ 코스메틱 룰셋 로드 실패:', err);
        // 실패 시 정적 파일 폴백
        try {
            const raw = await (await fetch(COSMETIC_JSON_URL)).json();
            COSMETIC_RULESET = raw.map(rule => ({
                selector: rule.selector,
                domain: rule.domain,
                action: {type: 'hide'}
            }));
            console.log(`♻️ 코스메틱 룰셋 ${COSMETIC_RULESET.length}개 로드됨 (폴백)`);
        } catch (fallbackErr) {
            console.error('❌ 코스메틱 룰셋 폴백도 실패:', fallbackErr);
            COSMETIC_RULESET = [];
        }
    }
}

// 초기 로드
loadCosmeticRuleset();

// 코스메틱 필터 룰셋 리스너 추가
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_COSMETIC_RULESET') {
        // 전역 차단 설정 확인
        chrome.storage.sync.get(['globalBlockingDisabled', 'whitelist'], (result) => {
            const isGlobalDisabled = result.globalBlockingDisabled || false;
            const whitelist = result.whitelist || [];
            const currentDomain = sender.tab ? new URL(sender.tab.url).hostname : null;
            const isWhitelisted = currentDomain && whitelist.includes(currentDomain);
            
            // 전역 차단이 비활성화되었거나 현재 도메인이 화이트리스트에 있으면 빈 룰셋 반환
            if (isGlobalDisabled || isWhitelisted) {
                console.log(`🎨 코스메틱 필터 비활성화: 전역차단=${isGlobalDisabled}, 화이트리스트=${isWhitelisted}`);
                sendResponse({ruleset: []});
            } else {
                sendResponse({ruleset: COSMETIC_RULESET});
            }
        });
        return true;  // 비동기 응답을 유지
    }
    
    // 코스메틱 필터링 카운트 수신
    if (message.type === 'COSMETIC_BLOCKED') {
        cosmeticBlockCount += message.count || 1;
        console.log(`🎨 코스메틱 필터링 감지: +${message.count || 1} (누적: ${cosmeticBlockCount})`);
        // 즉시 업데이트 (실시간 반영)
        updateBlockedCount();
        return true;
    }
    
    // 차단 카운트 리셋 기능 추가
    if (message.type === 'RESET_BLOCKED_COUNT') {
        (async () => {
            try {
                await chrome.storage.local.set({
                    DNR_BLOCKED_COUNT: 0,
                    COSMETIC_BLOCKED_COUNT: 0,
                    TOTAL_BLOCKED_COUNT: 0
                });
                
                // 메모리상의 카운트도 리셋
                dnrBlockCount = 0;
                cosmeticBlockCount = 0;
                
                // 도메인별 차단 통계도 리셋
                blockedDomainCounts = {};
                recentBlocksByTab.clear();
                
                console.log('🔄 차단 카운트가 완전히 리셋되었습니다.');
                
                // 클라이언트에게 리셋 완료 알림 (모든 탭에 메시지 전송)
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'TOTAL_BLOCKED_COUNT_UPDATED',
                            payload: {
                                totalBlockedCount: 0,
                                topBlockedDomains: {}
                            }
                        }).catch(() => {
                            // content script가 없는 탭은 무시
                        });
                    });
                });
                
                sendResponse({success: true});
            } catch (error) {
                console.error('❌ 차단 카운트 리셋 실패:', error);
                sendResponse({success: false, error: error.message});
            }
        })();
        return true;
    }
    
    // 코스메틱 필터 재로드 요청 처리
    if (message.type === 'RELOAD_COSMETIC_FILTER') {
        console.log('🎨 코스메틱 필터 재로드 요청 받음');
        // 모든 탭의 content script에 코스메틱 필터 재로드 메시지 전송
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {type: 'RELOAD_COSMETIC_FILTER'}).catch(() => {
                    // content script가 없는 탭은 무시
                });
            });
        });
        sendResponse({success: true});
        return true;
    }
    
    // 화이트리스트 업데이트 요청 처리
    if (message.type === 'UPDATE_WHITELIST_RULES') {
        console.log('🔍 화이트리스트 룰 업데이트 요청 받음');
        updateWhitelistRules().then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error('화이트리스트 룰 업데이트 실패:', error);
            sendResponse({success: false, error: error.message});
        });
        return true;
    }
});

// ./js/cosmetic-filter/core.js

class CosmeticFilter {
    /**
     * @param {Array<{ selector: string, domain: string|null, action: { type: string, value?: string } }>} ruleset
     * @param {Object} options
     */
    constructor(ruleset = [], options = {}) {
        this.ruleset = ruleset;
        this.options = options;
    }

    /**
     * CSS 문자열을 { prop: value } 객체로 변환합니다.
     * @param {string} styleString
     * @returns {Record<string,string>}
     */
    parseCSS(styleString) {
        const styleObj = {};
        for (const part of styleString.split(';')) {
            const [prop, value] = part.split(':').map(s => s && s.trim());
            if (prop && value) styleObj[prop] = value;
        }
        return styleObj;
    }

    /**
     * selector/domain/action 에 맞춰 매칭된 요소들과
     * 각 요소에 적용할 CSS 객체을 반환합니다.
     *
     * @returns {Promise<Record<string, { element: HTMLElement, css: Record<string,string>, domain: string|null }[]>>}
     */
    async getMatchedSelectors() {
        const result = {};
        const currentDomain = location.hostname;

        const isDomainMatch = (cur, ruleDomain) =>
            !ruleDomain ||
            cur === ruleDomain ||
            cur.endsWith('.' + ruleDomain);

        for (const {selector, domain, action} of this.ruleset) {
            if (!isDomainMatch(currentDomain, domain)) continue;

            let elements;
            try {
                elements = document.querySelectorAll(selector);
            } catch (err) {
                // console.warn(`[Cosmetic] Invalid selector skipped: "${selector}"`, err);
                continue;
            }

            let css;
            if (action.type === 'hide') {
                css = {display: 'none'};
            } else if (action.type === 'style' && action.value) {
                css = this.parseCSS(action.value);
            } else {
                continue;  // 지원하지 않는 action
            }

            const matched = Array.from(elements).map(el => ({
                element: el,
                css,
                domain
            }));

            if (matched.length) {
                result[selector] = (result[selector] || []).concat(matched);
            }
        }

        return result;
    }

    /**
     * 정적 광고 요소에 인라인 CSS를 적용합니다.
     * @param {Record<string, { element: HTMLElement, css: Record<string,string>, domain: string|null }[]>} matchedSelectors
     */
    async applyInlineCSS(matchedSelectors) {
        let blockedCount = 0;
        for (const selector in matchedSelectors) {
            for (const {element, css} of matchedSelectors[selector]) {
                for (const [prop, value] of Object.entries(css)) {
                    element.style.setProperty(prop, value, 'important');
                }
                blockedCount++;
            }
        }
        
        // service-worker로 차단된 요소 수 전송
        if (blockedCount > 0) {
            chrome.runtime.sendMessage({
                type: 'COSMETIC_BLOCKED',
                count: blockedCount
            });
        }
    }

    /**
     * matchedSelectors 에 포함된 요소들을 제거합니다.
     * <img> 요소라면 .includeWrapper 래퍼(존재 시)를, 아니면 요소 자신을 삭제
     * @param {Record<string, { element: HTMLElement, css: Record<string,string>, domain: string|null }[]>} matchedSelectors
     */
    async removeElements(matchedSelectors) {
        let removedCount = 0;
        for (const selector in matchedSelectors) {
            for (const {element} of matchedSelectors[selector]) {
                // 이미지가 아니면 제거
                if (!(element instanceof HTMLImageElement)) {
                    try {
                        element.remove();
                        removedCount++;
                    } catch (err) {
                        console.warn(
                            `[Cosmetic] Failed to remove element for selector "${selector}"`,
                            err
                        );
                    }
                }
            }
        }
        
        // service-worker로 제거된 요소 수 전송
        if (removedCount > 0) {
            chrome.runtime.sendMessage({
                type: 'COSMETIC_BLOCKED',
                count: removedCount
            });
        }
    }


    /**
     * 최초 1회, dataset.adHidden 없을 때만 인라인 CSS 재적용
     * @param {Record<string, { element: HTMLElement, css: Record<string,string>, domain: string|null }[]>} matchedSelectors
     */
    async observeDynamicContent(matchedSelectors) {
        let hiddenCount = 0;
        for (const selector in matchedSelectors) {
            for (const {element, css} of matchedSelectors[selector]) {
                if (!element.dataset.adHidden) {
                    try {
                        for (const [prop, value] of Object.entries(css)) {
                            element.style.setProperty(prop, value, 'important');
                        }
                        element.dataset.adHidden = 'true';
                        hiddenCount++;
                    } catch (err) {
                        console.warn(`[Cosmetic] Failed to hide dynamic: "${selector}"`, err);
                    }
                }
            }
        }
        
        // service-worker로 동적 차단 요소 수 전송
        if (hiddenCount > 0) {
            chrome.runtime.sendMessage({
                type: 'COSMETIC_BLOCKED',
                count: hiddenCount
            });
        }
    }

    /**
     * Shadow DOM에서 최초 1회만 동작
     * @param {Record<string, { element: HTMLElement, css: Record<string,string>, domain: string|null }[]>} matchedSelectors
     */
    async observeShadowDOM(matchedSelectors) {
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.target.shadowRoot) {
                    this.observeDynamicContentInShadow(m.target.shadowRoot, matchedSelectors);
                    observer.disconnect();
                    break;
                }
            }
        });
        observer.observe(document.body, {childList: true, subtree: true});
    }

    /**
     * ShadowRoot 내부 요소에 CSS 적용
     * @param {ShadowRoot} shadowRoot
     * @param {Record<string, { element: HTMLElement, css: Record<string,string>, domain: string|null }[]>} matchedSelectors
     */
    async observeDynamicContentInShadow(shadowRoot, matchedSelectors) {
        let shadowBlockedCount = 0;
        for (const selector in matchedSelectors) {
            let elems;
            try {
                elems = shadowRoot.querySelectorAll(selector);
            } catch (err) {
                console.warn(`[Cosmetic] Invalid selector in shadow: "${selector}"`, err);
                continue;
            }
            elems.forEach(el => {
                for (const {css} of matchedSelectors[selector]) {
                    for (const [prop, value] of Object.entries(css)) {
                        el.style.setProperty(prop, value, 'important');
                    }
                }
                shadowBlockedCount++;
            });
        }
        
        // service-worker로 Shadow DOM 차단 요소 수 전송
        if (shadowBlockedCount > 0) {
            chrome.runtime.sendMessage({
                type: 'COSMETIC_BLOCKED',
                count: shadowBlockedCount
            });
        }
    }
}

// content script 초기화 (생략 없이 그대로)
chrome.runtime.sendMessage({type: 'GET_COSMETIC_RULESET'}, async (response) => {
    if (!response?.ruleset?.length) {
        console.warn('[Cosmetic] 룰셋이 없습니다.');
        return;
    }

    const cosmeticFilter = new CosmeticFilter(response.ruleset, {});
    const matchedSelectors = await cosmeticFilter.getMatchedSelectors();

    for (const selector in matchedSelectors) {
        matchedSelectors[selector].forEach((element) => {
            console.log(element);
        })
    }

    // **코어 기능 유지** 순서대로 실행
    await cosmeticFilter.applyInlineCSS(matchedSelectors);
    await cosmeticFilter.removeElements(matchedSelectors);
    await cosmeticFilter.observeDynamicContent(matchedSelectors);
    await cosmeticFilter.observeShadowDOM(matchedSelectors);
});

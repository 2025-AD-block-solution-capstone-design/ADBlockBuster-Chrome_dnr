// js/rule-parser/cosmetic.js

/**
 * CosmeticRule: Adblock 스타일의 코스메틱 필터 룰 라인 하나를
 * 파싱해 { selector, domain } 배열로 변환합니다.
 */
class CosmeticRule {
    /**
     * @param {string} line 한 줄 필터 문자열 (예: "example.com##.ad-banner")
     * @returns {Array<{ selector: string, domain: string|null }>}
     */
    static parseSelectors(line) {
        // 빈 줄, 주석, 예외 필터(#@#) 무시
        if (!line || line.startsWith('!') || line.startsWith('@@') || line.includes('#@#')) {
            return [];
        }

        const parsed = [];
        // 도메인###ID 또는 도메인##CSS
        const triple = line.match(/^([^#]*)###(.+)$/);
        const double = !triple && line.match(/^([^#]*)##(.+)$/);

        let domainPart, selPart, type;
        if (triple) {
            type = 'id';
            domainPart = triple[1].trim();
            selPart = triple[2].trim();
        } else if (double) {
            type = 'css';
            domainPart = double[1].trim();
            selPart = double[2].trim();
        } else {
            return [];
        }

        if (!selPart) return [];

        const domain   = domainPart === '' ? null : domainPart;
        const selector = type === 'id' ? `#${selPart}` : selPart;

        parsed.push({ selector, domain });
        return parsed;
    }
}

/**
 * parseCosmeticRules
 * @param {string} txt EasyList/easyprivacy 텍스트 전체
 * @returns {Array<{ selector: string, domain: string|null, action: { type: "hide" } }>}
 */
export function parseCosmeticRules(txt) {
    const lines = txt.split(/\r?\n/);
    const out = [];

    for (const line of lines) {
        const items = CosmeticRule.parseSelectors(line.trim());
        for (const { selector, domain } of items) {
            out.push({
                selector,
                domain,
                action: { type: 'hide' }
            });
        }
    }

    return out;
}

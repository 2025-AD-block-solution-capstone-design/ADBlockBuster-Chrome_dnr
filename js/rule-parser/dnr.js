// js/rule-parser/dnr.js

/**
 * 브라우저 DNR 룰 생성용 클래스들
 */
class DNRRule {
    static idCounter = 1;

    constructor(actionType, urlFilter, resourceTypes = []) {
        this.id       = DNRRule.idCounter++;
        this.priority = 1;
        this.action   = { type: actionType };
        this.condition = { urlFilter };
        if (resourceTypes.length) {
            this.condition.resourceTypes = resourceTypes;
        }
    }

    toJSON() {
        return {
            id:       this.id,
            priority: this.priority,
            action:   this.action,
            condition: this.condition
        };
    }
}

class DNRBlockRule extends DNRRule {
    constructor(domain, optionString = '') {
        // ||domain^ 형태로 차단
        const filter = `||${domain}^`;
        const types = [];
        if (optionString.includes('image'))  types.push('image');
        if (optionString.includes('script')) types.push('script');
        super('block', filter, types);
    }
}

class DNRAllowRule extends DNRRule {
    constructor(domain) {
        super('allow', `||${domain}^`);
    }
}

/**
 * 한 줄을 파싱해 DNRRule 인스턴스를 반환하거나 null
 */
class DNRRuleParser {
    static parseLine(raw) {
        const line = raw.trim();
        if (!line || line.startsWith('!') || line.startsWith('[Adblock')) return null;

        // 예외 허용 룰 (@@||domain^...)
        const allowMatch = line.match(/^@@\|\|([^\^\/\$\*]+)\^(\$[^#]+)?/);
        if (allowMatch) {
            const [ , domain, opts = '' ] = allowMatch;
            // 도메인 제한(domain=)이나 3rd-party 등은 무시
            if (opts.includes('domain=') || opts.includes('third-party') || opts.includes('inline-script')) {
                return null;
            }
            return new DNRAllowRule(domain);
        }

        // 기본 차단 룰 (||domain^...)
        const blockMatch = line.match(/^\|\|([^\^\/\$\*]+)\^(\$[^#]+)?/);
        if (blockMatch) {
            const [ , domain, opts = '' ] = blockMatch;
            if (opts.includes('domain=') || opts.includes('third-party')) {
                return null;
            }
            return new DNRBlockRule(domain, opts);
        }

        return null;
    }
}

/**
 * parseDNRRules
 * @param {string} txt EasyList 또는 EasyPrivacy 텍스트 전체
 * @returns {Array<Object>} chrome.declarativeNetRequest 규격의 룰 객체 배열
 */
export function parseDNRRules(txt) {
    // 매번 호출 시 idCounter 리셋
    DNRRule.idCounter = 1;
    const lines = txt.split(/\r?\n/);
    const out = [];

    for (const line of lines) {
        const rule = DNRRuleParser.parseLine(line);
        if (rule) {
            out.push(rule.toJSON());
        }
    }

    return out;
}

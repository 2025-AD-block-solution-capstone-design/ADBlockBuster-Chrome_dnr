const fs = require('fs');

class CosmeticRule {

    constructor() {
    }

    /**
     * Adblock 스타일의 코스메틱 필터 룰셋을 파싱하여
     * CSS 셀렉터, 도메인 정보, 액션 정보를 추출합니다.
     *
     * `##`, `###` 접두사가 포함된 일반 필터만 처리하며,
     * `#@#`로 시작하는 예외 필터는 무시됩니다.
     *
     * ### 지원하는 필터 형식:
     *
     * - `##.foo`
     *   모든 도메인에서 `class="foo"`를 가진 요소를 숨깁니다.
     *   → 결과: `{ selector: ".foo", domain: null }`
     *
     * - `###bar`
     *   모든 도메인에서 `id="bar"`를 가진 요소를 숨깁니다.
     *   → 결과: `{ selector: "#bar", domain: null }`
     *
     * - `##[attr=val]`
     *   모든 도메인에서 `attr="val"` 속성을 가진 요소를 숨깁니다.
     *   → 결과: `{ selector: "[attr=val]", domain: null }`
     *
     * - `example.com##.foobar`
     *   `example.com` 도메인에서 `class="foobar"`를 가진 요소를 숨깁니다.
     *   → 결과: `{ selector: ".foobar", domain: "example.com" }`
     *
     * - `example.com###foobar`
     *   `example.com` 도메인에서 `id="foobar"`를 가진 요소를 숨깁니다.
     *   → 결과: `{ selector: "#foobar", domain: "example.com" }`
     *
     * - `example.com#@##foobar`
     *   ❌ 예외 필터 → 이 메서드에서는 무시됩니다.
     *
     * ### 파싱 방식:
     * - `###`는 ID 셀렉터로 해석되어 `#foobar` 형태로 변환됩니다.
     * - `##`는 일반 CSS 셀렉터 전체 (`.class`, `tag`, `[attr=val]` 등)를 그대로 사용합니다.
     * - 도메인이 붙은 경우는 `domain` 필드에 저장됩니다.
     *
     * @param {Array<{ selector: string, action: { type: string, value?: string } }>} ruleset
     *   원본 Adblock 코스메틱 필터 룰셋 배열 (원시 셀렉터 문자열 포함)
     *
     * @returns {Array<{ selector: string, domain: string | null, action: { type: string, value?: string } }>}
     *   파싱된 필터 정보 배열. CSS 셀렉터와 도메인, 액션을 포함합니다.
     */
    static parseSelectors(ruleset) {
        const parsed = [];

        const raw = ruleset;

        // ❌ 예외 필터 무시
        if (raw.includes('#@#')) {
            //
        }

        // 정확히 ### 또는 ## 를 구분하여 셀렉터 추출
        const tripleMatch = raw.match(/^([^#]*)###([^#].*)$/);
        const doubleMatch = raw.match(/^([^#]*)##([^#].*)$/);

        let matchType = null;
        let domainPart, selectorPart;

        if (tripleMatch) {
            matchType = 'id';
            domainPart = tripleMatch[1].trim();
            selectorPart = tripleMatch[2].trim();
        }
        if (doubleMatch) {
            matchType = 'css';
            domainPart = doubleMatch[1].trim();
            selectorPart = doubleMatch[2].trim();
        }

        if (!selectorPart) {
            //
        }

        const domain = domainPart === '' ? null : domainPart;
        const selector = matchType === 'id'
            ? `#${selectorPart}`
            : selectorPart;

        if (selector) {
            parsed.push({
                selector,
                domain
            });
        }

        // console.log("===========================")
        // console.log("[*] CosmeticFilter class init rule set")
        // console.dir(parsed);
        // console.log("===========================")
        return parsed;
    }
}


class CosmeticRuleGenerator {
    constructor() {
        this.rules = [];
    }

    loadFromFile(path) {
        const lines = fs.readFileSync(path, "utf-8").split(/\r?\n/);
        for (const line of lines) {
            if (!line || line.startsWith("!") || line.startsWith("@@")) {
                continue;
            }
            const parsed = CosmeticRule.parseSelectors(line);

            if (Array.isArray(parsed)) {
                if (parsed.length > 0) {
                    this.rules.push(...parsed);
                }
            } else if (parsed) {
                this.rules.push(parsed);
            }
        }
    }

    exportToFile(outputPath) {
        const ruleObjects = this.rules;
        fs.writeFileSync(outputPath, JSON.stringify(ruleObjects, null, 2));
        console.log(`생성 완료: ${outputPath}, (${ruleObjects.length}개 규칙)`);
    }
}

// const cosmeticSelectorGenerator = new CosmeticRuleGenerator();
// cosmeticSelectorGenerator.loadFromFile("../../easylist/easylist.txt");
// console.log(cosmeticSelectorGenerator.rules)
// cosmeticSelectorGenerator.exportToFile("../../ruleset/cosmeticList-selector.json");

export {CosmeticRuleGenerator};
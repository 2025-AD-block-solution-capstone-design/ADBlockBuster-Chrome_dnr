import fs from 'fs';

class DNRRule {
    static idCounter = 1;

    constructor(actionType, urlFilter, resourceTypes = []) {
        this.id = DNRRule.idCounter++;
        this.priority = 1;
        this.action = {type: actionType};
        this.condition = {urlFilter};

        if (resourceTypes.length > 0) {
            this.condition.resourceTypes = resourceTypes;
        }
    }

    toJSON() {
        return {
            id: this.id,
            priority: this.priority,
            action: this.action,
            condition: this.condition
        };
    }
}

class DNRBlockRule extends DNRRule {
    constructor(domain, optionString = "") {
        const urlFilter = `||${domain}^`;
        const resourceTypes = [];

        if (optionString.includes("image")) resourceTypes.push("image");
        if (optionString.includes("script")) resourceTypes.push("script");

        super("block", urlFilter, resourceTypes);
    }
}

class DNRAllowRule extends DNRRule {
    constructor(domain) {
        const urlFilter = `||${domain}^`;
        super("allow", urlFilter);
    }
}

class DNRRuleParser {
    static parseLine(line) {
        line = line.trim();
        if (line === "" || line.startsWith("!") || line.startsWith("[Adblock")) return null;

        const allowMatch = line.match(/^@@\|\|([^\^\/\$\*]+)\^(\$[^#]+)?/);
        if (allowMatch) {
            const domain = allowMatch[1];
            const option = allowMatch[2] || "";
            if (option.includes("domain=") || option.includes("third-party") || option.includes("inline-script")) return null;
            return new DNRAllowRule(domain);
        }

        const blockMatch = line.match(/^\|\|([^\^\/\$\*]+)\^(\$[^#]+)?/);
        if (blockMatch) {
            const domain = blockMatch[1];
            const option = blockMatch[2] || "";
            if (option.includes("domain=") || option.includes("third-party")) return null;
            return new DNRBlockRule(domain, option);
        }

        return null;
    }
}

class DNRRuleGenerator {
    constructor() {
        this.rules = [];
    }

    loadFromFile(path) {
        const lines = fs.readFileSync(path, "utf-8").split("\n");
        for (const line of lines) {
            const rule = DNRRuleParser.parseLine(line);
            if (rule) this.rules.push(rule);
        }
    }

    exportToFile(outputPath) {
        const ruleObjects = this.rules.map(rule => rule.toJSON());
        fs.writeFileSync(outputPath, JSON.stringify(ruleObjects, null, 2));
        console.log(`생성 완료: ${outputPath}, (${ruleObjects.length}개 규칙)`);
    }
}

export {DNRRuleGenerator, DNRRuleParser, DNRRule, DNRBlockRule, DNRAllowRule};
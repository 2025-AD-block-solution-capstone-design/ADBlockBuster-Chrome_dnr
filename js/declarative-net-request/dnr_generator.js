import fs from "fs";
import path from "path";
import {downloadFile, extractVersion} from "./dnr_utils.js";
import {DNRRuleGenerator} from "../rule-parser/dnr";

const SRC_URL = "https://easylist.to/easylist/easylist.txt";
const TXT_TMP = "easylist.txt";            // 임시
const VER_FILE = "easylist.version";
const OUT_JSON = path.resolve("ruleset/block1.json");

downloadFile(SRC_URL, TXT_TMP, () => {
    const newV = extractVersion(TXT_TMP);
    const oldV = fs.existsSync(VER_FILE) ? fs.readFileSync(VER_FILE, "utf-8") : "";

    if (newV !== oldV) {
        const gen = new DNRRuleGenerator();
        gen.loadFromFile(TXT_TMP);
        gen.exportToFile(OUT_JSON);         // ruleset/ 로 출력
        fs.writeFileSync(VER_FILE, newV);
        console.log("  block1.json 갱신:", newV);
    } else {
        console.log("동일 버전 - 재생성 생략");
    }
});

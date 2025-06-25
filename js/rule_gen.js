import {DNRRuleGenerator} from "./rule-parser/dnr";
import {CosmeticRuleGenerator} from "./rule-parser/cosmetic";

const dnrNetworkGenerator = new DNRRuleGenerator();
dnrNetworkGenerator.loadFromFile("../easylist/easylist.txt");
dnrNetworkGenerator.exportToFile("../ruleset/dnrList-network.json");

const dnrPrivacyGenerator = new DNRRuleGenerator();
dnrPrivacyGenerator.loadFromFile("../easylist/easyprivacy.txt");
dnrPrivacyGenerator.exportToFile("../ruleset/dnrList-privacy.json");

const cosmeticSelectorGenerator = new CosmeticRuleGenerator();
cosmeticSelectorGenerator.loadFromFile("../easylist/easylist.txt");
cosmeticSelectorGenerator.exportToFile("../ruleset/cosmeticList-selector.json");

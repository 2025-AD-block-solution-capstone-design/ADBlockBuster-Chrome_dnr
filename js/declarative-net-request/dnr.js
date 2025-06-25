// js/dnr.js – 브라우저(service-worker·popup 등)에서 import
'use strict';

export const updateEnabledRulesets = async (options) => {
    return chrome.declarativeNetRequest.updateEnabledRulesets(options);
}

export const updateDynamicRules = async (options) => {
    return chrome.declarativeNetRequest.updateDynamicRules(options);
}

export const getMatchedRules = async (options) => {
    return chrome.declarativeNetRequest.getMatchedRules(options);
}

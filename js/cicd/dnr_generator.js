import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { parseDNRRules } from '../rule-parser/dnr.js';

const EASYLIST_URL = 'https://easylist.to/easylist/easylist.txt';
const VERSION_PREFIX = '! Version:';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const RULESET_PATH = path.join(EXTENSION_ROOT, 'ruleset', 'block1.json');
const VERSION_FILE_PATH = path.join(EXTENSION_ROOT, 'easylist.version');

function downloadEasyList(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download (${res.statusCode})`));
          res.resume();
          return;
        }
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function extractVersion(text) {
  return (
    text
      .split(/\r?\n/)
      .find(line => line.startsWith(VERSION_PREFIX))
      ?.trim() ?? null
  );
}

async function readCurrentVersion() {
  try {
    const content = await fs.readFile(VERSION_FILE_PATH, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

async function writeRuleset(rules) {
  const payload = JSON.stringify(rules, null, 2);
  await fs.writeFile(RULESET_PATH, `${payload}\n`, 'utf8');
}

async function writeVersion(version) {
  await fs.writeFile(VERSION_FILE_PATH, `${version}\n`, 'utf8');
}

async function regenerateRuleset() {
  console.log('[dnr_generator] Downloading EasyList…');
  const easyListText = await downloadEasyList(EASYLIST_URL);
  const freshVersion = extractVersion(easyListText);

  if (!freshVersion) {
    throw new Error('Unable to locate EasyList version header.');
  }

  const currentVersion = await readCurrentVersion();
  if (currentVersion === freshVersion) {
    console.log(`[dnr_generator] Up to date (${freshVersion}). Skipping regeneration.`);
    return;
  }

  console.log('[dnr_generator] Parsing EasyList entries…');
  const rules = parseDNRRules(easyListText);
  console.log(`[dnr_generator] Parsed ${rules.length} rules.`);

  await writeRuleset(rules);
  await writeVersion(freshVersion);

  console.log(`[dnr_generator] Updated block1.json and easylist.version -> ${freshVersion}`);
}

regenerateRuleset().catch(err => {
  console.error('[dnr_generator] Failed to update ruleset:', err);
  process.exitCode = 1;
});

const EASYLIST_URL = 'https://easylist.to/easylist/easylist.txt';
const VERSION_PREFIX = '! Version:';

function extractVersion(text) {
  if (!text) return null;
  const match = text.match(/^!?\s*Version:\s*(.+)$/im);
  return match ? match[1].trim() : text.trim() || null;
}

async function fetchLocalVersion() {
  try {
    const response = await fetch(chrome.runtime.getURL('easylist.version'));
    if (!response.ok) throw new Error(`(${response.status})`);
    const text = await response.text();
    return extractVersion(text);
  } catch (error) {
    console.warn('[update-info] Failed to read packaged version file.', error);
    return null;
  }
}

async function fetchRemoteVersion() {
  const response = await fetch(EASYLIST_URL);
  if (!response.ok) {
    throw new Error(`EasyList 다운로드 실패 (${response.status})`);
  }
  const text = await response.text();
  const version = extractVersion(text);
  if (!version) {
    throw new Error('EasyList에서 버전 정보를 찾을 수 없습니다.');
  }
  return version;
}

export function initRulesetInfo({ checkButton, statusNode, versionNode }) {
  if (!checkButton || !statusNode || !versionNode) {
    console.warn('[update-info] Missing UI elements for update section.');
    return;
  }

  let localVersionCache = null;

  const setStatus = message => {
    statusNode.textContent = message ?? '';
  };

  const updateLocalVersionLabel = version => {
    versionNode.textContent = version ?? '알 수 없음';
  };

  const loadLocalVersion = async () => {
    localVersionCache = await fetchLocalVersion();
    updateLocalVersionLabel(localVersionCache);
  };

  checkButton.addEventListener('click', async () => {
    checkButton.disabled = true;
    setStatus('최신 버전을 확인하는 중…');
    try {
      if (!localVersionCache) {
        await loadLocalVersion();
      }
      const remoteVersion = await fetchRemoteVersion();
      if (localVersionCache === remoteVersion) {
        setStatus(`현재 버전(${remoteVersion})이 최신입니다.`);
      } else {
        setStatus(`새 버전(${remoteVersion})이 있습니다. 배포 전에 업데이트 스크립트를 실행하세요.`);
      }
    } catch (error) {
      setStatus(`확인 실패: ${error.message}`);
    } finally {
      checkButton.disabled = false;
    }
  });

  loadLocalVersion();

  return {
    async refreshLocalVersion() {
      await loadLocalVersion();
    }
  };
}

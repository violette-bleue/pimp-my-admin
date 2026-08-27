const ADMIN_URL_RE = /^https?:\/\/[^/]+\.forumactif\.com\/admin\//;
const HASH_KEY = "pma_last_hash";
const ENABLED_KEY = "pma_auto_reload";

async function fetchText(path) {
  const res = await fetch(chrome.runtime.getURL(path));
  return res.text();
}

async function computeCurrentHash() {
  const manifest = JSON.parse(await fetchText("manifest.json"));

  const paths = new Set(["manifest.json"]);
  for (const cs of manifest.content_scripts || []) {
    (cs.js || []).forEach((p) => paths.add(p));
    (cs.css || []).forEach((p) => paths.add(p));
  }
  for (const war of manifest.web_accessible_resources || []) {
    (war.resources || []).forEach((p) => paths.add(p));
  }

  let combined = "";
  for (const path of [...paths].sort()) {
    combined += path + ":" + (await fetchText(path));
  }

  let hash = 5381;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 33 + combined.charCodeAt(i)) | 0;
  }
  return String(hash);
}

async function checkAndReloadIfStale() {
  const { [ENABLED_KEY]: enabled = true } = await chrome.storage.local.get(ENABLED_KEY);
  if (!enabled) return;

  let currentHash;
  try {
    currentHash = await computeCurrentHash();
  } catch (err) {
    console.error("Echec de l'auto-reload", err);
    return;
  }

  const { [HASH_KEY]: lastHash } = await chrome.storage.local.get(HASH_KEY);

  if (lastHash === undefined) {
    await chrome.storage.local.set({ [HASH_KEY]: currentHash });
    return;
  }

  if (lastHash !== currentHash) {
    await chrome.storage.local.set({ [HASH_KEY]: currentHash });
    chrome.runtime.reload();
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  if (!tab.url || !ADMIN_URL_RE.test(tab.url)) return;
  checkAndReloadIfStale();
});

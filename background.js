const ADMIN_URL_RE = /^https?:\/\/[^/]+\.forumactif\.com\/admin\//;
const HASH_KEY = "pma_last_hash";
const ENABLED_KEY = "pma_auto_reload";

const UPDATE_ENABLED_KEY = "pma_update_check";
const UPDATE_INFO_KEY = "pma_update_info";
const UPDATE_DISMISSED_KEY = "pma_update_dismissed";
const UPDATE_TS_KEY = "pma_update_check_ts";
const UPDATE_INTERVAL = 60 * 60 * 1000;
const REMOTE_MANIFEST = "https://raw.githubusercontent.com/violette-bleue/pimp-my-admin/main/manifest.json";
const REMOTE_PATCHNOTES = "https://raw.githubusercontent.com/violette-bleue/pimp-my-admin/main/patchnotes.json";

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

function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function checkForUpdate(force) {
  const {
    [UPDATE_ENABLED_KEY]: enabled = true,
    [UPDATE_TS_KEY]: lastTs = 0,
    [UPDATE_INFO_KEY]: info = null,
  } = await chrome.storage.local.get([UPDATE_ENABLED_KEY, UPDATE_TS_KEY, UPDATE_INFO_KEY]);

  if (!force && !enabled) return;

  const localVersion = chrome.runtime.getManifest().version;

  if (info && compareVersions(localVersion, info.version) >= 0) {
    await chrome.storage.local.set({ [UPDATE_INFO_KEY]: null });
  }

  if (!force && Date.now() - lastTs < UPDATE_INTERVAL) return;
  await chrome.storage.local.set({ [UPDATE_TS_KEY]: Date.now() });

  let remoteVersion;
  try {
    const res = await fetch(REMOTE_MANIFEST, { cache: "no-store" });
    remoteVersion = JSON.parse(await res.text()).version;
  } catch (err) {
    console.error("Echec de la verif de mise a jour", err);
    return;
  }

  if (compareVersions(remoteVersion, localVersion) <= 0) {
    await chrome.storage.local.set({ [UPDATE_INFO_KEY]: null });
    return;
  }

  let entries = [];
  try {
    const res = await fetch(REMOTE_PATCHNOTES, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    entries = JSON.parse(await res.text())
      .filter((entry) => compareVersions(entry.version, localVersion) > 0)
      .sort((a, b) => compareVersions(b.version, a.version));
  } catch (err) {
    console.error("Echec de lecture des patchnotes", err);
  }

  await chrome.storage.local.set({
    [UPDATE_INFO_KEY]: { version: remoteVersion, entries },
  });
}

async function refreshBadge() {
  const {
    [UPDATE_INFO_KEY]: info = null,
    [UPDATE_DISMISSED_KEY]: dismissed = null,
  } = await chrome.storage.local.get([UPDATE_INFO_KEY, UPDATE_DISMISSED_KEY]);

  const show = !!(info && info.version && info.version !== dismissed);
  await chrome.action.setBadgeText({ text: show ? "MAJ" : "" });
  if (show) {
    await chrome.action.setBadgeBackgroundColor({ color: "#ffd400" });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: "#1e1e2e" });
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  if (!tab.url || !ADMIN_URL_RE.test(tab.url)) return;
  checkAndReloadIfStale();
  checkForUpdate(false);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[UPDATE_INFO_KEY] || changes[UPDATE_DISMISSED_KEY]) refreshBadge();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "pma-check-update") {
    checkForUpdate(true).then(() => sendResponse({ ok: true }));
    return true;
  }
});

refreshBadge();

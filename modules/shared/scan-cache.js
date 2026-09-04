import { normalize } from "./util.js";

export function sourceSignature(source) {
  return source.type === "local"
    ? `local:${source.handle.name}`
    : `github:${source.owner}/${source.repo}@${source.branch}/${source.theme}`;
}

export function loadScanCache(source, moduleKey) {
  try {
    const raw = sessionStorage.getItem(`pma-scan-cache:${moduleKey}:` + sourceSignature(source));
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

export function saveScanCache(source, moduleKey, cache) {
  try {
    sessionStorage.setItem(`pma-scan-cache:${moduleKey}:` + sourceSignature(source), JSON.stringify(cache));
  } catch (err) {
    // intentionnel
  }
}

export function getCachedStatus(cache, name, mtime) {
  const entry = cache[name];
  return entry && entry.mtime === mtime ? entry.status : null;
}

export function setCachedStatus(cache, name, mtime, status) {
  cache[name] = { mtime, status };
}

export async function compareWithCache(fileHandle, name, editUrl, cache, fetchLiveContent) {
  const localContent = await fileHandle.text();
  const mtime = fileHandle.mtime ? await fileHandle.mtime() : null;

  if (mtime != null) {
    const cached = getCachedStatus(cache, name, mtime);
    if (cached) return { status: cached, localContent, mtime, fromCache: true };
  }

  let liveContent;
  try {
    liveContent = await fetchLiveContent(editUrl);
  } catch (err) {
    return { status: "error", localContent, mtime, fromCache: false };
  }

  const status = normalize(localContent) !== normalize(liveContent) ? "diff" : "same";
  if (mtime != null) setCachedStatus(cache, name, mtime, status);
  return { status, localContent, mtime, fromCache: false };
}

import { normalize } from "../shared/util.js";
import { fetchLiveContent } from "./network.js";

export function sourceSignature(source) {
  return source.type === "local"
    ? `local:${source.handle.name}`
    : `github:${source.owner}/${source.repo}@${source.branch}/${source.theme}`;
}

export function loadScanCache(source) {
  try {
    const raw = sessionStorage.getItem("pma-scan-cache:" + sourceSignature(source));
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

export function saveScanCache(source, cache) {
  try {
    sessionStorage.setItem("pma-scan-cache:" + sourceSignature(source), JSON.stringify(cache));
  } catch (err) {
    // intentionnel
  }
}

export function getCachedStatus(cache, tplName, mtime) {
  const entry = cache[tplName];
  return entry && entry.mtime === mtime ? entry.status : null;
}

export function setCachedStatus(cache, tplName, mtime, status) {
  cache[tplName] = { mtime, status };
}

export async function compareWithCache(fileHandle, tplName, editUrl, cache) {
  const localContent = await fileHandle.text();
  const mtime = fileHandle.mtime ? await fileHandle.mtime() : null;

  if (mtime != null) {
    const cached = getCachedStatus(cache, tplName, mtime);
    if (cached) return { status: cached, localContent, mtime, fromCache: true };
  }

  let liveContent;
  try {
    liveContent = await fetchLiveContent(editUrl);
  } catch (err) {
    return { status: "error", localContent, mtime, fromCache: false };
  }

  const status = normalize(localContent) !== normalize(liveContent) ? "diff" : "same";
  if (mtime != null) setCachedStatus(cache, tplName, mtime, status);
  return { status, localContent, mtime, fromCache: false };
}

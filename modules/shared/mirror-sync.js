import { setIconContent, setProgressState } from "./dom.js";
import { resolveLocalFile } from "../source/source.js";
import { setCachedStatus, saveScanCache, loadScanCache } from "./scan-cache.js";

const POLL_INTERVAL_MS = 4000;
const LOG_MAX_LINES = 30;

export function computeTickDecision(entry, currentMtime) {
  if (currentMtime === entry.lastConfirmedMtime) {
    entry.candidateMtime = null;
    return { action: "none" };
  }
  if (currentMtime === entry.candidateMtime) {
    return { action: "confirmed", mtime: currentMtime };
  }
  entry.candidateMtime = currentMtime;
  return { action: "wait" };
}

// Options seed/discover
export function mountMirrorSyncControls(
  container,
  { index, source, moduleKey, network, seedEntries, discoverEntries, itemNoun = "élément", category = null, publish = false }
) {
  if (!source || source.type !== "local") return null;

  const wrapper = document.createElement("div");
  wrapper.id = "pma-mirror-sync";

  const toggleLabel = document.createElement("label");
  const toggleCheckbox = document.createElement("input");
  toggleCheckbox.type = "checkbox";
  const toggleText = document.createElement("span");
  toggleText.className = "pma-icon-label";
  setIconContent(toggleText, "icons8-toggle-off-32", "Lancer le live sync");
  toggleLabel.append(toggleCheckbox, toggleText);
  wrapper.appendChild(toggleLabel);

  let publishCheckbox = null;
  if (publish) {
    const publishLabel = document.createElement("label");
    publishLabel.id = "pma-mirror-sync-publish";
    publishCheckbox = document.createElement("input");
    publishCheckbox.type = "checkbox";
    const publishText = document.createElement("span");
    publishText.className = "pma-icon-label";
    setIconContent(publishText, "icons8-check-32", "Publication automatique");
    publishLabel.append(publishCheckbox, publishText);
    wrapper.appendChild(publishLabel);

    publishCheckbox.addEventListener("change", () => {
      publishLabel.classList.toggle("pma-checked", publishCheckbox.checked);
    });
  }

  const status = document.createElement("div");
  status.className = "pma-scan-progress";
  status.hidden = true;
  wrapper.appendChild(status);

  const logArea = document.createElement("textarea");
  logArea.id = "pma-mirror-sync-log";
  logArea.readOnly = true;
  wrapper.appendChild(logArea);

  container.appendChild(wrapper);

  const pmaPanel = container.closest("#pma-panel");

  let entries = [];
  let timerId = null;

  function setStatus(text, iconName = "icons8-on-32") {
    status.hidden = false;
    setIconContent(status, iconName, text);
  }

  function updateToggleIcon() {
    setIconContent(toggleText, toggleCheckbox.checked ? "icons8-on-32" : "icons8-toggle-off-32", "Lancer le sync live");
  }

  function logLine(text) {
    const time = new Date().toLocaleTimeString();
    const lines = logArea.value ? logArea.value.split("\n") : [];
    lines.unshift(`${time} — ${text}`);
    if (lines.length > LOG_MAX_LINES) lines.length = LOG_MAX_LINES;
    logArea.value = lines.join("\n");
  }

  function toWatchEntry(entry) {
    return {
      name: entry.name,
      category: category ?? entry.category ?? null, // slug
      categoryLabel: entry.categoryLabel ?? null, // libellé
      editUrl: entry.editUrl,
      publishUrl: entry.publishUrl,
      isPending: entry.isPending,
      lastConfirmedMtime: entry.mtime,
      candidateMtime: null,
      state: "idle",
    };
  }

  function entryLabel(entry) {
    return entry.categoryLabel ? `${entry.categoryLabel} / ${entry.name}` : entry.name;
  }

  async function handleConfirmedChange(entry, mtime, fileHandle) {
    entry.state = "pushing";
    try {
      const localContent = await fileHandle.text();
      const savedHtml = await network.pushContent(entry.editUrl, localContent);
      if (publish && network.derivePendingState) network.derivePendingState(entry, savedHtml, entry.editUrl);

      const cache = loadScanCache(source, moduleKey);
      setCachedStatus(cache, entry.name, mtime, "same");
      saveScanCache(source, moduleKey, cache);
      entry.lastConfirmedMtime = mtime;
      logLine(`✅ ${entryLabel(entry)} — mis à jour`);

      if (publish && entry.isPending && entry.publishUrl && publishCheckbox?.checked) {
        try {
          await network.publish(entry.publishUrl);
          entry.isPending = false;
          logLine(`✅ ${entryLabel(entry)} — publié`);
        } catch (err) {
          logLine(`⚠️ ${entryLabel(entry)} — échec de la publication`);
        }
      }
    } catch (err) {
      logLine(`❌ ${entryLabel(entry)} — échec du push`);
      console.error("Live Sync — échec push", entry.name, err);
      entry.candidateMtime = null;
    } finally {
      entry.state = "idle";
    }
  }

  async function pollTick() {
    for (const entry of entries) {
      if (entry.state !== "idle") continue;

      const fileHandle = resolveLocalFile(index, entry.name, entry.category);
      if (!fileHandle) {
        entry.state = "missing";
        logLine(`❓ ${entryLabel(entry)} — fichier local introuvable, retiré de la surveillance`);
        continue;
      }

      let mtime;
      try {
        mtime = await fileHandle.mtime();
      } catch (err) {
        entry.state = "error";
        logLine(`❌ ${entryLabel(entry)} — erreur de lecture, retiré de la surveillance`);
        continue;
      }
      if (mtime == null) continue;

      const decision = computeTickDecision(entry, mtime);
      if (decision.action === "confirmed") await handleConfirmedChange(entry, decision.mtime, fileHandle);
    }
  }

  toggleCheckbox.addEventListener("change", async () => {
    if (toggleCheckbox.checked) {
      toggleCheckbox.disabled = true;

      if (discoverEntries) {
        setProgressState(status, "running");
        setStatus("Scan initial en cours…", "icons8-rocket-32");
        const discovered = await discoverEntries((label, i, n, { reused }) => {
          setStatus(
            reused ? `Catégorie "${label}" (${i}/${n}) — déjà analysée, réutilisation…` : `Catégorie "${label}" (${i}/${n})…`,
            "icons8-rocket-32"
          );
        });
        entries = discovered.filter((e) => e.status === "same").map(toWatchEntry);
      } else {
        entries = seedEntries.filter((e) => e.status === "same").map(toWatchEntry);
      }

      setProgressState(status, "done");
      setStatus(`Surveillance active \n ${entries.length} ${itemNoun}(s) suivi(s).`, "icons8-sync-32");
      pmaPanel?.classList.add("sync-on");
      updateToggleIcon();
      timerId = setInterval(pollTick, POLL_INTERVAL_MS);
      toggleCheckbox.disabled = false;
    } else {
      if (timerId) clearInterval(timerId);
      timerId = null;
      entries = [];
      setProgressState(status, null);
      setStatus("Live Sync désactivé.", "icons8-sync-32");
      pmaPanel?.classList.remove("sync-on");
      updateToggleIcon();
    }
  });

  return wrapper;
}

import { setIconContent } from "./dom.js";
import { sleep, scheduleReload } from "./util.js";
import { resolveLocalFile } from "../source/source.js";
import { loadScanCache, saveScanCache, compareWithCache, setCachedStatus } from "./scan-cache.js";

const STATUS_ICONS = {
  same: ["icons8-check-32", ""],
  missing: ["icons8-question-32", "pas de fichier local"],
  error: ["icons8-close-window-32", "erreur réseau"],
};

// Rows/network attendus
export async function mountSyncList(
  container,
  { index, rows, source, moduleKey, network, itemNoun = "élément", category = null, publish = false }
) {
  const summary = document.createElement("div");
  summary.id = "pma-summary";
  summary.textContent = `Analyse de ${rows.length} ${itemNoun}(s)…`;
  container.appendChild(summary);

  const updateAllBtn = document.createElement("button");
  updateAllBtn.type = "button";
  updateAllBtn.hidden = true;
  container.appendChild(updateAllBtn);

  const publishAllBtn = document.createElement("button");
  publishAllBtn.type = "button";
  publishAllBtn.hidden = true;
  if (publish) container.appendChild(publishAllBtn);

  const updateAndPublishAllBtn = document.createElement("button");
  updateAndPublishAllBtn.type = "button";
  updateAndPublishAllBtn.hidden = true;
  if (publish) container.appendChild(updateAndPublishAllBtn);

  const entries = [];
  const scanCache = loadScanCache(source, moduleKey);

  for (const row of rows) {
    const cell = document.createElement("span");
    cell.className = "pma-row-badge";
    row.nameCell.appendChild(cell);

    const entry = { ...row, status: "same", cell };
    entries.push(entry);

    const entryCategory = category ?? row.category ?? null;
    const fileHandle = resolveLocalFile(index, row.name, entryCategory);
    if (!fileHandle) {
      entry.status = "missing";
      renderCell(entry);
      continue;
    }

    setIconContent(cell, "icons8-rocket-32", "");

    const result = await compareWithCache(fileHandle, row.name, row.editUrl, scanCache, network.fetchLiveContent);
    entry.localContent = result.localContent;
    entry.mtime = result.mtime;
    entry.status = result.status;
    renderCell(entry);

    if (!result.fromCache) await sleep(50);
  }

  saveScanCache(source, moduleKey, scanCache);
  refreshButtons();

  function refreshButtons() {
    const diffEntries = entries.filter((e) => e.status === "diff");
    const missingCount = entries.filter((e) => e.status === "missing").length;
    const errorCount = entries.filter((e) => e.status === "error").length;
    const pendingEntries = publish ? entries.filter((e) => e.isPending && e.publishUrl) : [];

    summary.textContent =
      `${entries.length} ${itemNoun}(s) analysés \n Différent : ${diffEntries.length} \n ` +
      (publish ? `Non publié : ${pendingEntries.length} \n ` : "") +
      `Sans fichier local : ${missingCount} \n Erreur : ${errorCount}`;

    updateAllBtn.hidden = diffEntries.length === 0;
    if (diffEntries.length > 0) {
      setIconContent(updateAllBtn, "icons8-lipstick-32", `Mettre à jour \n (${diffEntries.length} ${itemNoun}(s))`);
    }

    if (publish) {
      publishAllBtn.hidden = pendingEntries.length === 0;
      if (pendingEntries.length > 0) {
        setIconContent(publishAllBtn, "icons8-check-32", `Publier \n (${pendingEntries.length} ${itemNoun}(s))`);
      }

      updateAndPublishAllBtn.hidden = diffEntries.length === 0;
      if (diffEntries.length > 0) {
        setIconContent(
          updateAndPublishAllBtn,
          "icons8-heel-32",
          `Mettre à jour et publier \n (${diffEntries.length} ${itemNoun}(s))`
        );
      }
    }
  }

  updateAllBtn.addEventListener("click", async () => {
    const targets = entries.filter((e) => e.status === "diff");
    const ok = confirm(`Tu confirmes la mise à jour de ${targets.length} ${itemNoun}(s) ?`);
    if (!ok) return;
    updateAllBtn.disabled = true;
    let anySuccess = false;
    for (const entry of targets) {
      if (await updateEntry(entry, null, { reload: false })) anySuccess = true;
      await sleep(300);
    }
    updateAllBtn.disabled = false;
    refreshButtons();
    if (anySuccess) {
      summary.textContent = `Mise à jour effectuée sur ${targets.length} ${itemNoun}(s) — rechargement de la page…`;
      scheduleReload();
    }
  });

  if (publish) {
    publishAllBtn.addEventListener("click", async () => {
      const targets = entries.filter((e) => e.isPending && e.publishUrl);
      const ok = confirm(`Tu confirmes la publication de ${targets.length} ${itemNoun}(s) ?`);
      if (!ok) return;
      publishAllBtn.disabled = true;
      for (const entry of targets) {
        await publishEntry(entry);
        await sleep(300);
      }
      publishAllBtn.disabled = false;
      refreshButtons();
    });

    updateAndPublishAllBtn.addEventListener("click", async () => {
      const targets = entries.filter((e) => e.status === "diff");
      const ok = confirm(`Tu confirmes la mise à jour ET la publication de ${targets.length} ${itemNoun}(s) ?`);
      if (!ok) return;
      updateAndPublishAllBtn.disabled = true;
      let anySuccess = false;
      for (const entry of targets) {
        if (await updateAndPublishEntry(entry, null, { reload: false })) anySuccess = true;
        await sleep(300);
      }
      updateAndPublishAllBtn.disabled = false;
      refreshButtons();
      if (anySuccess) {
        summary.textContent = `Mise à jour + publication effectuées sur ${targets.length} ${itemNoun}(s) — rechargement de la page…`;
        scheduleReload();
      }
    });
  }

  function renderCell(entry) {
    if (entry.tr) {
      entry.tr.dataset.pmaStatus = entry.status;
      if (publish) entry.tr.dataset.pmaPending = entry.isPending ? "1" : "0";
    }

    entry.cell.innerHTML = "";
    const cfg = STATUS_ICONS[entry.status];
    if (cfg) {
      const icons = document.createElement("span");
      icons.className = "pma-icon-label";
      setIconContent(icons, cfg[0], cfg[1]);
      entry.cell.appendChild(icons);
    }

    if (entry.status === "diff") {
      const btn = document.createElement("button");
      btn.className = "pma-inline-btn";
      setIconContent(btn, "icons8-error-32", "Mettre à jour");
      btn.type = "button";
      btn.addEventListener("click", () => updateEntry(entry, btn));
      entry.cell.appendChild(btn);

      if (publish) {
        const btnBoth = document.createElement("button");
        btnBoth.className = "pma-inline-btn";
        setIconContent(btnBoth, "icons8-lipstick-32", "Mettre à jour + Publier");
        btnBoth.type = "button";
        btnBoth.addEventListener("click", () => updateAndPublishEntry(entry, btnBoth));
        entry.cell.appendChild(btnBoth);
      }
    }

    refreshButtons();
  }

  async function updateEntry(entry, btn, { reload = true } = {}) {
    if (btn) {
      btn.disabled = true;
      setIconContent(btn, "icons8-rocket-32", "envoi…");
    }
    try {
      const savedHtml = await network.pushContent(entry.editUrl, entry.localContent);
      entry.status = "same";
      if (publish && network.derivePendingState) network.derivePendingState(entry, savedHtml, entry.editUrl);
      if (entry.mtime != null) {
        setCachedStatus(scanCache, entry.name, entry.mtime, "same");
        saveScanCache(source, moduleKey, scanCache);
      }
      renderCell(entry);
      if (reload) {
        setIconContent(entry.cell, "icons8-check-32", "mis à jour — rechargement…");
        scheduleReload();
      }
      return true;
    } catch (err) {
      setIconContent(entry.cell, "icons8-close-window-32", "échec");
      console.error("échec mise à jour ):", entry.name, err);
      return false;
    }
  }

  async function publishEntry(entry, btn) {
    if (btn) {
      btn.disabled = true;
      setIconContent(btn, "icons8-rocket-32", "…");
    }
    try {
      await network.publish(entry.publishUrl);
      entry.isPending = false;
      renderCell(entry);
      const check = document.createElement("span");
      check.className = "pma-icon-label";
      setIconContent(check, "icons8-check-32", "publié");
      entry.cell.appendChild(check);
      return true;
    } catch (err) {
      console.error("échec publication ):", entry.name, err);
      if (btn) setIconContent(btn, "icons8-close-window-32", "échec");
      return false;
    }
  }

  async function updateAndPublishEntry(entry, btn, { reload = true } = {}) {
    const updated = await updateEntry(entry, btn, { reload: false });
    if (!updated) return false;

    if (!entry.publishUrl) {
      console.warn(
        "mise à jour réussie mais lien de publication introuvable pour",
        entry.name,
        "— publication à faire manuellement désolé ):"
      );
      if (reload) scheduleReload();
      return true;
    }

    const published = await publishEntry(entry, null);
    if (reload) {
      setIconContent(
        entry.cell,
        "icons8-check-32",
        published ? "mis à jour + publié — rechargement…" : "mis à jour (publication échouée) — rechargement…"
      );
      scheduleReload();
    }
    return true;
  }

  return { entries };
}

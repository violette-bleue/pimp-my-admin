import { slugifyCategory } from "../shared/categories.js";
import { setIconContent } from "../shared/dom.js";
import { sleep, scheduleReload } from "../shared/util.js";
import { resolveLocalFile } from "../source/source.js";
import { loadScanCache, saveScanCache, compareWithCache, setCachedStatus } from "./scan-cache.js";
import { pushContent, publishTemplate, derivePendingAfterUpdate } from "./network.js";
import { mountExportButton } from "./export.js";

export async function mountCategoryTab(container, { index, rows, source, currentCategory }) {
  const STATUS_ICONS = {
    same: ["icons8-check-32", ""],
    missing: ["icons8-question-32", "pas de fichier local"],
    error: ["icons8-close-window-32", "erreur réseau"],
  };

  const currentCategorySlug = currentCategory ? slugifyCategory(currentCategory) : null;

  mountExportButton(container, source, { onlyCategory: currentCategory });

  const summary = document.createElement("div");
  summary.id = "pma-summary";
  summary.textContent = `Analyse de ${rows.length} templates…`;
  container.appendChild(summary);

  const updateAllBtn = document.createElement("button");
  updateAllBtn.type = "button";
  updateAllBtn.hidden = true;
  container.appendChild(updateAllBtn);

  const publishAllBtn = document.createElement("button");
  publishAllBtn.type = "button";
  publishAllBtn.hidden = true;
  container.appendChild(publishAllBtn);

  const updateAndPublishAllBtn = document.createElement("button");
  updateAndPublishAllBtn.type = "button";
  updateAndPublishAllBtn.hidden = true;
  container.appendChild(updateAndPublishAllBtn);

  const entries = [];
  const scanCache = loadScanCache(source);

  for (const row of rows) {
    const cell = document.createElement("span");
    cell.className = "pma-row-badge";
    row.nameCell.appendChild(cell);

    const entry = { ...row, status: "same", cell };
    entries.push(entry);

    const fileHandle = resolveLocalFile(index, row.tplName, currentCategorySlug);
    if (!fileHandle) {
      entry.status = "missing";
      renderCell(entry);
      continue;
    }

    setIconContent(cell, "icons8-rocket-32", "");

    const result = await compareWithCache(fileHandle, row.tplName, row.editUrl, scanCache);
    entry.localContent = result.localContent;
    entry.mtime = result.mtime;
    entry.status = result.status;
    renderCell(entry);

    if (!result.fromCache) await sleep(50);
  }

  saveScanCache(source, scanCache);
  refreshButtons();

  function refreshButtons() {
    const diffEntries = entries.filter((e) => e.status === "diff");
    const pendingEntries = entries.filter((e) => e.isPending && e.publishUrl);
    summary.textContent =
      `${entries.length} templates analysés \n Différent : ${diffEntries.length} \n ` +
      `Non publié : ${pendingEntries.length}`;

    updateAllBtn.hidden = diffEntries.length === 0;
    if (diffEntries.length > 0) {
      setIconContent(updateAllBtn, "icons8-lipstick-32", `Mettre à jour \n (${diffEntries.length} templates)`);
    }

    publishAllBtn.hidden = pendingEntries.length === 0;
    if (pendingEntries.length > 0) {
      setIconContent(publishAllBtn, "icons8-check-32", `Publier \n (${pendingEntries.length} templates)`);
    }

    updateAndPublishAllBtn.hidden = diffEntries.length === 0;
    if (diffEntries.length > 0) {
      setIconContent(
        updateAndPublishAllBtn,
        "icons8-heel-32",
        `Mettre à jour et publier \n (${diffEntries.length} templates)`
      );
    }
  }

  updateAllBtn.addEventListener("click", async () => {
    const targets = entries.filter((e) => e.status === "diff");
    const ok = confirm(`Tu confirmes la mise à jour de ${targets.length} templates ?`);
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
      summary.textContent = `Mise à jour effectuée sur ${targets.length} templates — rechargement rapidos de la page…`;
      scheduleReload();
    }
  });

  publishAllBtn.addEventListener("click", async () => {
    const targets = entries.filter((e) => e.isPending && e.publishUrl);
    const ok = confirm(`Tu confirmes la publication de ${targets.length} templates ?`);
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
    const ok = confirm(`Tu confirmes la mise à jour ET la publication de ${targets.length} templates ?`);
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
      summary.textContent = `Mise à jour + publication effectuées sur ${targets.length} templates — rechargement de la page…`;
      scheduleReload();
    }
  });

  function renderCell(entry) {
    entry.tr.dataset.pmaStatus = entry.status;
    entry.tr.dataset.pmaPending = entry.isPending ? "1" : "0";

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

      const btnBoth = document.createElement("button");
      btnBoth.className = "pma-inline-btn";
      setIconContent(btnBoth, "icons8-lipstick-32", "Mettre à jour + Publier");
      btnBoth.type = "button";
      btnBoth.addEventListener("click", () => updateAndPublishEntry(entry, btnBoth));
      entry.cell.appendChild(btnBoth);
    }


    refreshButtons();
  }

  async function updateEntry(entry, btn, { reload = true } = {}) {
    if (btn) {
      btn.disabled = true;
      setIconContent(btn, "icons8-rocket-32", "envoi…");
    }
    try {
      const savedHtml = await pushContent(entry.editUrl, entry.localContent);
      entry.status = "same";
      derivePendingAfterUpdate(entry, savedHtml, entry.editUrl);
      if (entry.mtime != null) {
        setCachedStatus(scanCache, entry.tplName, entry.mtime, "same");
        saveScanCache(source, scanCache);
      }
      renderCell(entry);
      if (reload) {
        setIconContent(entry.cell, "icons8-check-32", "mis à jour — rechargement…");
        scheduleReload();
      }
      return true;
    } catch (err) {
      setIconContent(entry.cell, "icons8-close-window-32", "échec");
      console.error("échec mise à jour ):", entry.tplName, err);
      return false;
    }
  }

  async function publishEntry(entry, btn) {
    if (btn) {
      btn.disabled = true;
      setIconContent(btn, "icons8-rocket-32", "…");
    }
    try {
      await publishTemplate(entry.publishUrl);
      entry.isPending = false;
      renderCell(entry);
      const check = document.createElement("span");
      check.className = "pma-icon-label";
      setIconContent(check, "icons8-check-32", "publié");
      entry.cell.appendChild(check);
      return true;
    } catch (err) {
      console.error("échec publication ):", entry.tplName, err);
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
        entry.tplName,
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

  return { seed: { category: currentCategory, entries } };
}

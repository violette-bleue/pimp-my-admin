import { extractCategoryLinks } from "../shared/categories.js";
import { setIconContent, setProgress, setProgressState } from "../shared/dom.js";
import { sleep } from "../shared/util.js";
import { saveScanCache, setCachedStatus } from "../shared/scan-cache.js";
import { pushContent, publishTemplate, derivePendingAfterUpdate } from "./network.js";
import { buildInventory } from "./inventory.js";

const MODULE_KEY = "templates";

function categoriesCount(entries) {
  return new Set(entries.map((e) => e.category)).size;
}

function renderScanResults(section, entries, source, scanCache) {
  const SCAN_LINE_ICONS = { // ptites icon jolies
    diff: "icons8-error-32",
    missing: "icons8-question-32",
    error: "icons8-close-window-32",
    same: "icons8-error-32",
  };

  const missingCount = entries.filter((e) => e.status === "missing").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  const summary = document.createElement("div");
  summary.id = "pma-summary";
  section.appendChild(summary);

  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  section.appendChild(updateBtn);

  const publishBtn = document.createElement("button");
  publishBtn.type = "button";
  section.appendChild(publishBtn);

  const updateAndPublishBtn = document.createElement("button");
  updateAndPublishBtn.type = "button";
  section.appendChild(updateAndPublishBtn);

  function refreshButtons() {
    const diffEntries = entries.filter((e) => e.status === "diff");
    const pendingEntries = entries.filter((e) => e.isPending && e.publishUrl);

    summary.textContent =
      `${entries.length} templates (${categoriesCount(entries)} catégories) analysés \n` +
      `Différent : ${diffEntries.length}\n Non publié : ${pendingEntries.length} \n ` +
      `Sans fichier local : ${missingCount} \n Erreur : ${errorCount}`;

    updateBtn.hidden = diffEntries.length === 0;
    if (diffEntries.length > 0) {
      setIconContent(updateBtn, "icons8-lipstick-32", `Mettre à jour \n (${diffEntries.length} templates)`);
    }

    publishBtn.hidden = pendingEntries.length === 0;
    if (pendingEntries.length > 0) {
      setIconContent(publishBtn, "icons8-check-32", `Publier \n (${pendingEntries.length} templates)`);
    }

    updateAndPublishBtn.hidden = diffEntries.length === 0;
    if (diffEntries.length > 0) {
      setIconContent(
        updateAndPublishBtn,
        "icons8-heel-32",
        `Mettre à jour et publier \n (${diffEntries.length} templates)`
      );
    }
  }

  updateBtn.addEventListener("click", async () => {
    const targets = entries.filter((e) => e.status === "diff");
    const ok = confirm(`Confirmer la mise à jour de ${targets.length} templates sur le forum en ligne ?`);
    if (!ok) return;
    updateBtn.disabled = true;
    for (const entry of targets) {
      await scanUpdate(entry);
      await sleep(300);
    }
    updateBtn.disabled = false;
    refreshButtons();
  });

  publishBtn.addEventListener("click", async () => {
    const targets = entries.filter((e) => e.isPending && e.publishUrl);
    const ok = confirm(`Confirmer la publication de ${targets.length} templates ?`);
    if (!ok) return;
    publishBtn.disabled = true;
    for (const entry of targets) {
      await scanPublish(entry);
      await sleep(300);
    }
    publishBtn.disabled = false;
    refreshButtons();
  });

  updateAndPublishBtn.addEventListener("click", async () => {
    const targets = entries.filter((e) => e.status === "diff");
    const ok = confirm(`Confirmer la mise à jour ET la publication de ${targets.length} templates sur le forum en ligne ?`);
    if (!ok) return;
    updateAndPublishBtn.disabled = true;
    for (const entry of targets) {
      await scanUpdateAndPublish(entry);
      await sleep(300);
    }
    updateAndPublishBtn.disabled = false;
    refreshButtons();
  });

  refreshButtons();

  const list = document.createElement("div");
  list.id = "pma-scan-list";
  section.appendChild(list);

  const actionable = entries.filter(
    (e) => e.status === "diff" || e.status === "missing" || e.status === "error" || (e.isPending && e.publishUrl)
  );

  const grouped = new Map();
  for (const entry of actionable) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category).push(entry);
  }

  for (const [category, catEntries] of grouped) {
    const catContainer = document.createElement("div");
    catContainer.className = "pma-scan-categorie";

    const title = document.createElement("div");
    title.className = "pma-scan-categorie-title";
    title.textContent = `${category} (${catEntries.length})`;
    catContainer.appendChild(title);

    for (const entry of catEntries) {
      const line = document.createElement("div");
      line.className = "pma-scan-line";
      entry.lineEl = line;
      renderLine(entry);
      catContainer.appendChild(line);
    }
    list.appendChild(catContainer);
  }

  function renderLine(entry) {
    const label = `${entry.category} / ${entry.tplName}`;
    setIconContent(entry.lineEl, SCAN_LINE_ICONS[entry.status] || "icons8-question-32", label);
  }

  async function scanUpdate(entry) {
    try {
      const savedHtml = await pushContent(entry.editUrl, entry.localContent);
      entry.status = "same";
      derivePendingAfterUpdate(entry, savedHtml, entry.editUrl);
      if (entry.mtime != null) {
        setCachedStatus(scanCache, entry.tplName, entry.mtime, "same");
        saveScanCache(source, MODULE_KEY, scanCache);
      }
      if (entry.lineEl) setIconContent(entry.lineEl, "icons8-check-32", `${entry.category} / ${entry.tplName} — mis à jour`);
      return true;
    } catch (err) {
      if (entry.lineEl) setIconContent(entry.lineEl, "icons8-close-window-32", `${entry.category} / ${entry.tplName} — échec mise à jour`);
      console.error("Echec mise à jour ):", entry.tplName, err);
      return false;
    }
  }

  async function scanPublish(entry) {
    try {
      await publishTemplate(entry.publishUrl);
      entry.isPending = false;
      setIconContent(entry.lineEl, "icons8-check-32", `${entry.category} / ${entry.tplName} — publié`);
      return true;
    } catch (err) {
      setIconContent(entry.lineEl, "icons8-close-window-32", `${entry.category} / ${entry.tplName} — échec publication`);
      console.error("Echec publication ):", entry.tplName, err);
      return false;
    }
  }

  async function scanUpdateAndPublish(entry) {
    const updated = await scanUpdate(entry);
    if (!updated) return false;
    if (!entry.publishUrl) {
      console.warn(
        "Mise à jour réussie mais lien de publication introuvable pour",
        entry.category,
        entry.tplName,
        "— publication à faire manuellement désolé ):"
      );
      return true;
    }
    await scanPublish(entry);
    return true;
  }
}

export async function runFullScan(container, index, source, seed) {
  let section = container.querySelector("#pma-scan");
  if (section) section.remove();
  section = document.createElement("div");
  section.id = "pma-scan";
  container.appendChild(section);

  const categories = extractCategoryLinks(document, location.href);
  if (!categories.length) {
    section.textContent = "Aucune catégorie trouvée sur cette page";
    return;
  }

  const progress = document.createElement("div");
  progress.className = "pma-scan-progress";
  setProgressState(progress, "running");
  section.appendChild(progress);

  const { entries: allEntries, scanCache } = await buildInventory(source, index, {
    seed,
    onProgress: (label, i, n, { reused }) => {
      setProgress(
        progress,
        reused ? `Catégorie "${label}" (${i}/${n}) — déjà analysée, réutilisation…` : `Catégorie "${label}" (${i}/${n})…`
      );
    },
  });

  progress.remove();
  renderScanResults(section, allEntries, source, scanCache);
}

import { extractCategoryLinks, extractTemplateRows, slugifyCategory } from "../shared/categories.js";
import { setIconContent, setProgress, setProgressState, setPanelBusy } from "../shared/dom.js";
import { sleep } from "../shared/util.js";
import { fetchLiveContent } from "./network.js";

const MODULE_KEY = "templates";

export function mountExportButton(container, source, { onlyCategory } = {}) {
  const exportOptions = document.createElement("label");
  exportOptions.id = "pma-export-options";
  const exportAllCheckbox = document.createElement("input");
  exportAllCheckbox.type = "checkbox";
  exportOptions.append(
    exportAllCheckbox,
    document.createTextNode("Exporter aussi les templates non modifiés (ceux par défaut) ?")
  );

  const exportBtn = document.createElement("button");
  setIconContent(
    exportBtn,
    "icons8-save-32",
    onlyCategory ? `Exporter les templates` : "Exporter tous les templates"
  );
  exportBtn.type = "button";
  exportBtn.className = "export";
  exportBtn.addEventListener("click", () =>
    runExport(container, source, exportBtn, exportAllCheckbox.checked, { onlyCategory })
  );
  container.append(exportBtn, exportOptions);
}

async function resolveExportDestination(source, progress) {
  if (source && source.type === "local") {
    let perm;
    try {
      perm = await source.handle.requestPermission({ mode: "readwrite" });
    } catch (err) {
      console.error("échec de la demande de permission ):", err);
      progress.textContent =
        "Impossible de demander la permission d'écriture (dossier introuvable, re-clique sur \"Exporter\" pour réessayer).";
      return null;
    }
    if (perm === "granted") return source.handle;
    progress.textContent = "Permission d'écriture refusée ):";
    return null;
  }

  progress.textContent = "Choisis le dossier de destination…";
  try {
    return await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (err) {
    return null;
  }
}

async function destFileExists(destHandle, categorySlug, tplName) {
  try {
    const moduleHandle = await destHandle.getDirectoryHandle(MODULE_KEY);
    const catHandle = await moduleHandle.getDirectoryHandle(categorySlug);
    await catHandle.getFileHandle(tplName + ".html");
    return true;
  } catch (err) {
    return false;
  }
}

export async function runExport(container, source, triggerBtn, includeDefaults, { onlyCategory } = {}) {
  triggerBtn.disabled = true;
  setPanelBusy(container, true);

  let section = container.querySelector("#pma-export");
  if (section) section.remove();
  section = document.createElement("div");
  section.id = "pma-export";
  container.appendChild(section);

  const progress = document.createElement("div");
  progress.className = "pma-scan-progress";
  section.appendChild(progress);

  try {
    setProgressState(progress, "running");

    const categories = extractCategoryLinks(document, location.href).filter(
      (cat) => !onlyCategory || cat.label === onlyCategory
    );
    if (!categories.length) {
      progress.textContent = "Aucune catégorie trouvée sur cette page ??"; // fallback
      setProgressState(progress, "error");
      return;
    }

    const destHandle = await resolveExportDestination(source, progress);
    if (!destHandle) {
      progress.textContent = "Export annulé (aucun dossier de destination)"; // fallback
      setProgressState(progress, "error");
      return;
    }

    const collected = [];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const categorySlug = slugifyCategory(cat.label);
      setProgress(progress, `Récupération "${cat.label}" (${i + 1}/${categories.length})…`);

      try {
        const res = await fetch(cat.url, { credentials: "include" });
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const rows = extractTemplateRows(doc, cat.url);

        for (const row of rows) {
          try {
            const content = await fetchLiveContent(row.editUrl);
            collected.push({ categorySlug, tplName: row.tplName, content, isDefault: row.isDefault });
          } catch (err) {
            console.error("échec récupération ):", row.tplName, err);
          }
          await sleep(50);
        }
      } catch (err) {
        console.error("échec analyse catégorie ):", cat.label, err);
      }
    }

  progress.textContent = `${collected.length} templates récupérés par l'extension, export en cours vers le dossier...`;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of collected) {
      try {
        const existed = await destFileExists(destHandle, item.categorySlug, item.tplName);
        if (!existed && item.isDefault && !includeDefaults) {
          skipped++;
          continue;
        }

        const moduleHandle = await destHandle.getDirectoryHandle(MODULE_KEY, { create: true });
        const catHandle = await moduleHandle.getDirectoryHandle(item.categorySlug, { create: true });
        const fileHandle = await catHandle.getFileHandle(item.tplName + ".html", { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(item.content);
        await writable.close();
        if (existed) updated++;
        else created++;
      } catch (err) {
        console.error("échec écriture", item.tplName, err);
      }
    }

    progress.textContent =
      `Export terminé dans "${destHandle.name}" : ${updated} mis à jour, ${created} créés, ` +
      `${skipped} ignorés`;
    setProgressState(progress, "done");
  } finally {
    triggerBtn.disabled = false;
    setPanelBusy(container, false);
  }
}

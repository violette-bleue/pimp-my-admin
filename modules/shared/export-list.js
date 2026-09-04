import { setIconContent, setProgress, setProgressState, setPanelBusy } from "./dom.js";
import { sleep } from "./util.js";
import { toSafeName, nameMarkerLine } from "./safe-name.js";

export function mountExportButton(container, source, { moduleKey, rows, network, extension, itemNoun = "élément" }) {
  const exportBtn = document.createElement("button");
  setIconContent(exportBtn, "icons8-save-32", `Exporter les ${itemNoun}s`);
  exportBtn.type = "button";
  exportBtn.className = "export";
  exportBtn.addEventListener("click", () =>
    runExport(container, source, exportBtn, { moduleKey, rows, network, extension, itemNoun })
  );
  container.append(exportBtn);
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

async function destFileExists(destHandle, moduleKey, name, extension) {
  try {
    const modHandle = await destHandle.getDirectoryHandle(moduleKey);
    await modHandle.getFileHandle(name + extension);
    return true;
  } catch (err) {
    return false;
  }
}

export async function runExport(container, source, triggerBtn, { moduleKey, rows, network, extension, itemNoun }) {
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

    if (!rows.length) {
      progress.textContent = `Aucun(e) ${itemNoun} trouvé(e) sur cette page ??`; // fallback
      setProgressState(progress, "error");
      return;
    }

    const destHandle = await resolveExportDestination(source, progress);
    if (!destHandle) {
      progress.textContent = "Export annulé (aucun dossier de destination)"; // fallback
      setProgressState(progress, "error");
      return;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setProgress(progress, `Récupération "${row.name}" (${i + 1}/${rows.length})…`);

      try {
        const content = await network.fetchLiveContent(row.editUrl);
        const safeName = toSafeName(row.name);
        const fileBody = safeName === row.name ? content : nameMarkerLine(row.name, moduleKey) + content;
        const existed = await destFileExists(destHandle, moduleKey, safeName, extension);

        const modHandle = await destHandle.getDirectoryHandle(moduleKey, { create: true });
        const fileHandle = await modHandle.getFileHandle(safeName + extension, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(fileBody);
        await writable.close();

        if (existed) updated++;
        else created++;
      } catch (err) {
        failed++;
        console.error("échec export ):", row.name, err);
      }

      await sleep(50);
    }

    progress.textContent =
      `Export terminé dans "${destHandle.name}" : ${updated} mis à jour, ${created} créés` +
      (failed ? `, ${failed} échec(s)` : "");
    setProgressState(progress, "done");
  } finally {
    triggerBtn.disabled = false;
    setPanelBusy(container, false);
  }
}

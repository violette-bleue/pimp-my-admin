import { buildTabs } from "../shared/tabs.js";
import { showSourceInfo, setHeaderSource } from "../shared/panel.js";
import { setIconContent, setProgressState, setProgress } from "../shared/dom.js";
import { sleep } from "../shared/util.js";
import { loadSource, forgetSource } from "../source/source.js";
import { extractForumTree, flattenTree, depthOf } from "./rows.js";
import { fetchForumTreeDoc, deleteEntity, StaleFormError } from "./network.js";
import { mountBulkPermissionsToolbar } from "./permissions-panel.js";
import { mountExportImport } from "./export-import.js";
import { injectInlineHub } from "./inline-hub.js";

function mountDeleteSelectionButton(container, getSelectedEntities, entities) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const btn = document.createElement("button");
  btn.type = "button";
  setIconContent(btn, "icons8-close-window-32", "Supprimer la sélection");
  container.appendChild(btn);

  const progress = document.createElement("div");
  progress.className = "pma-scan-progress";
  progress.hidden = true;
  container.appendChild(progress);

  btn.addEventListener("click", async () => {
    // Profondeur décroissante
    const targets = getSelectedEntities()
      .filter((e) => e.deleteUrl)
      .sort((a, b) => depthOf(b, byId) - depthOf(a, byId));
    if (!targets.length) {
      alert("Coche au moins un forum ou une catégorie.");
      return;
    }
    const ok = confirm(
      `Supprimer définitivement ${targets.length} élément(s) : ${targets.map((e) => e.name).join(", ")} ?\nCette action est irréversible.`
    );
    if (!ok) return;

    btn.disabled = true;
    progress.hidden = false;
    setProgressState(progress, "running");
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const entity = targets[i];
      setProgress(progress, `Suppression "${entity.name}" (${i + 1}/${targets.length})…`);
      try {
        await deleteEntity(entity.deleteUrl);
      } catch (err) {
        if (err instanceof StaleFormError) {
          setProgressState(progress, "error");
          progress.textContent = "Page périmée — recharge la page et réessaie.";
          return;
        }
        failed++;
        console.error("échec suppression ):", entity.name, err);
      }
      await sleep(300);
    }
    setProgressState(progress, failed ? "error" : "done");
    progress.textContent = failed
      ? `${targets.length - failed}/${targets.length} supprimé(s), ${failed} échec(s) — rechargement…`
      : `${targets.length} élément(s) supprimé(s) — rechargement…`;
    setTimeout(() => location.reload(), failed ? 1800 : 900);
  });
}

export async function runForumsHub(panel) {
  const body = panel.querySelector("#pma-body");

  const tabs = buildTabs([
    { id: "source", label: "Source" },
    { id: "bulk", label: "Presets & sélection" },
    { id: "export", label: "Export / Import" },
  ]);
  body.appendChild(tabs.root);
  tabs.setActive("source");

  const sourcePanel = tabs.panels.get("source");
  const bulkPanel = tabs.panels.get("bulk");
  const exportPanel = tabs.panels.get("export");

  for (const p of [bulkPanel, exportPanel]) {
    p.classList.add("pma-tab-placeholder");
    p.textContent = "Configure une source pour continuer…";
  }

  const source = await loadSource(sourcePanel);
  if (!source) return;

  setHeaderSource(panel, source);

  sourcePanel.innerHTML = "";
  showSourceInfo(sourcePanel, source, async () => {
    await forgetSource();
    location.reload();
  });

  for (const p of [bulkPanel, exportPanel]) {
    p.classList.remove("pma-tab-placeholder");
    p.textContent = "";
  }

  let treeResult;
  try {
    const { doc, baseUrl } = await fetchForumTreeDoc();
    treeResult = extractForumTree(doc, baseUrl);
  } catch (err) {
    console.error("échec de récupération de l'arborescence ):", err);
    bulkPanel.textContent = "Échec du chargement de l'arborescence.";
    return;
  }

  const inline = injectInlineHub(treeResult);
  const getSelectedEntities = inline ? inline.getSelectedEntities : () => [];

  if (!inline) {
    bulkPanel.textContent =
      "Impossible d'accéder à la page native FA (structure inattendue) — la vue arborescence intégrée n'a pas pu s'afficher.";
  } else {
    // Toggle global
    panel.pmaNativeToggle?.onToggle((active) => inline.setActive(active));
  }

  mountBulkPermissionsToolbar(bulkPanel, getSelectedEntities);
  mountDeleteSelectionButton(bulkPanel, getSelectedEntities, flattenTree(treeResult.categories));
  mountExportImport(exportPanel, {
    categories: treeResult.categories,
    rootCreateUrl: treeResult.rootCreateUrl,
    source,
  });

  tabs.setActive("bulk");
}

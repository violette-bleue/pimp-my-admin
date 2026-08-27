import { getCurrentCategoryLabel } from "../shared/categories.js";
import { buildTabs } from "../shared/tabs.js";
import { showSourceInfo, buildFolderErrorMessage, setHeaderSource } from "../shared/panel.js";
import { loadSource, forgetSource, buildFileIndex } from "../source/source.js";
import { mountCategoryTab } from "./category-tab.js";
import { mountExportButton } from "./export.js";
import { runFullScan } from "./full-scan.js";
import { mountMirrorSyncControls } from "./mirror-sync.js";

export async function runListPage(panel, rows) {
  const body = panel.querySelector("#pma-body");

  const tabs = buildTabs([
    { id: "source", label: "Source" },
    { id: "current", label: "Catégorie actuelle" },
    { id: "all", label: "Toutes les catégories" },
    { id: "mirror", label: "Live sync" },
  ]);
  body.appendChild(tabs.root);
  tabs.setActive("source");

  const sourcePanel = tabs.panels.get("source");
  const currentPanel = tabs.panels.get("current");
  const allPanel = tabs.panels.get("all");
  const mirrorPanel = tabs.panels.get("mirror");

  for (const p of [currentPanel, allPanel, mirrorPanel]) {
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

  let index;
  try {
    index = await buildFileIndex(source);
  } catch (err) {
    console.error("Echec de lecture du dossier source", err);
    buildFolderErrorMessage(sourcePanel, async () => {
      await forgetSource();
      location.reload();
    });
    return;
  }

  const currentCategory = getCurrentCategoryLabel(document, location.href);

  for (const p of [currentPanel, allPanel, mirrorPanel]) {
    p.classList.remove("pma-tab-placeholder");
    p.textContent = "";
  }

  const { seed } = await mountCategoryTab(currentPanel, { index, rows, source, currentCategory });

  mountExportButton(allPanel, source);
  tabs.onShow("all", () => runFullScan(allPanel, index, source, seed), { once: true });

  mountMirrorSyncControls(mirrorPanel, { index, source, seed });

  tabs.setActive("current");
}

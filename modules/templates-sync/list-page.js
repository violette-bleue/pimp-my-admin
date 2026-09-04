import { getCurrentCategoryLabel, slugifyCategory } from "../shared/categories.js";
import { buildTabs } from "../shared/tabs.js";
import { showSourceInfo, buildFolderErrorMessage, setHeaderSource } from "../shared/panel.js";
import { loadSource, forgetSource, buildFileIndex } from "../source/source.js";
import { mountSyncList } from "../shared/sync-list.js";
import { mountMirrorSyncControls } from "../shared/mirror-sync.js";
import { mountExportButton } from "./export.js";
import { runFullScan } from "./full-scan.js";
import { buildInventory } from "./inventory.js";
import { fetchLiveContent, pushContent, publishTemplate, derivePendingAfterUpdate } from "./network.js";

const MODULE_KEY = "templates";

const network = {
  fetchLiveContent,
  pushContent,
  publish: publishTemplate,
  derivePendingState: derivePendingAfterUpdate,
};

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
    index = await buildFileIndex(source, MODULE_KEY, { withCategories: true });
  } catch (err) {
    console.error("Echec de lecture du dossier source", err);
    buildFolderErrorMessage(sourcePanel, async () => {
      await forgetSource();
      location.reload();
    });
    return;
  }

  const currentCategory = getCurrentCategoryLabel(document, location.href);
  const currentCategorySlug = currentCategory ? slugifyCategory(currentCategory) : null;

  for (const p of [currentPanel, allPanel, mirrorPanel]) {
    p.classList.remove("pma-tab-placeholder");
    p.textContent = "";
  }

  mountExportButton(currentPanel, source, { onlyCategory: currentCategory });

  const syncRows = rows.map((r) => ({ ...r, name: r.tplName }));
  const { entries } = await mountSyncList(currentPanel, {
    index,
    rows: syncRows,
    source,
    moduleKey: MODULE_KEY,
    network,
    itemNoun: "template",
    category: currentCategorySlug,
    publish: true,
  });

  mountExportButton(allPanel, source);
  tabs.onShow("all", () => runFullScan(allPanel, index, source, { category: currentCategory, entries }), { once: true });

  mountMirrorSyncControls(mirrorPanel, {
    index,
    source,
    moduleKey: MODULE_KEY,
    network,
    itemNoun: "template",
    publish: true,
    discoverEntries: (onProgress) =>
      buildInventory(source, index, { seed: { category: currentCategory, entries }, onProgress }).then((r) =>
        r.entries.map((e) => ({
          ...e,
          name: e.tplName,
          category: slugifyCategory(e.category),
          categoryLabel: e.category,
        }))
      ),
  });

  tabs.setActive("current");
}

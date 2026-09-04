import { showSourceInfo, buildFolderErrorMessage, setHeaderSource } from "../shared/panel.js";
import { loadSource, forgetSource, buildFileIndex } from "../source/source.js";
import { buildTabs } from "../shared/tabs.js";
import { mountSyncList } from "../shared/sync-list.js";
import { mountMirrorSyncControls } from "../shared/mirror-sync.js";
import { mountExportButton } from "../shared/export-list.js";
import { mountCreateMissing } from "../shared/create-missing.js";
import * as network from "./network.js";

export async function runHtmlPagesListPage(panel, rows, createTrigger) {
  const body = panel.querySelector("#pma-body");

  const tabs = buildTabs([
    { id: "source", label: "Source" },
    { id: "pages", label: "Pages HTML" },
    { id: "mirror", label: "Live sync" },
    { id: "export", label: "Export" },
  ]);
  body.appendChild(tabs.root);
  tabs.setActive("source");

  const sourcePanel = tabs.panels.get("source");
  const pagesPanel = tabs.panels.get("pages");
  const mirrorPanel = tabs.panels.get("mirror");
  const exportPanel = tabs.panels.get("export");

  for (const p of [pagesPanel, mirrorPanel, exportPanel]) {
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
    index = await buildFileIndex(source, "html");
  } catch (err) {
    console.error("Echec de lecture du dossier source ):", err);
    buildFolderErrorMessage(sourcePanel, async () => {
      await forgetSource();
      location.reload();
    });
    return;
  }

  for (const p of [pagesPanel, mirrorPanel, exportPanel]) {
    p.classList.remove("pma-tab-placeholder");
    p.textContent = "";
  }

  mountCreateMissing(pagesPanel, { index, rows, network, createTrigger, itemNoun: "page" });

  const { entries } = await mountSyncList(pagesPanel, { index, rows, source, moduleKey: "html", network, itemNoun: "page" });

  mountMirrorSyncControls(mirrorPanel, { index, source, moduleKey: "html", network, seedEntries: entries, itemNoun: "page" });

  mountExportButton(exportPanel, source, { moduleKey: "html", rows, network, extension: ".html", itemNoun: "page" });

  tabs.setActive("pages");
}

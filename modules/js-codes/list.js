import { showSourceInfo, buildFolderErrorMessage, setHeaderSource } from "../shared/panel.js";
import { loadSource, forgetSource, buildFileIndex } from "../source/source.js";
import { buildTabs } from "../shared/tabs.js";
import { mountSyncList } from "../shared/sync-list.js";
import { mountMirrorSyncControls } from "../shared/mirror-sync.js";
import { mountExportButton } from "../shared/export-list.js";
import { mountCreateMissing } from "../shared/create-missing.js";
import * as network from "./network.js";

export async function runJsCodesListPage(panel, rows, createTrigger) {
  const body = panel.querySelector("#pma-body");

  const tabs = buildTabs([
    { id: "source", label: "Source" },
    { id: "codes", label: "Codes JS" },
    { id: "mirror", label: "Live sync" },
    { id: "export", label: "Export" },
  ]);
  body.appendChild(tabs.root);
  tabs.setActive("source");

  const sourcePanel = tabs.panels.get("source");
  const codesPanel = tabs.panels.get("codes");
  const mirrorPanel = tabs.panels.get("mirror");
  const exportPanel = tabs.panels.get("export");

  for (const p of [codesPanel, mirrorPanel, exportPanel]) {
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
    index = await buildFileIndex(source, "js");
  } catch (err) {
    console.error("Echec de lecture du dossier source ):", err);
    buildFolderErrorMessage(sourcePanel, async () => {
      await forgetSource();
      location.reload();
    });
    return;
  }

  for (const p of [codesPanel, mirrorPanel, exportPanel]) {
    p.classList.remove("pma-tab-placeholder");
    p.textContent = "";
  }

  mountCreateMissing(codesPanel, { index, rows, network, createTrigger, itemNoun: "code" });

  const { entries } = await mountSyncList(codesPanel, { index, rows, source, moduleKey: "js", network, itemNoun: "code" });

  mountMirrorSyncControls(mirrorPanel, { index, source, moduleKey: "js", network, seedEntries: entries, itemNoun: "code" });

  mountExportButton(exportPanel, source, { moduleKey: "js", rows, network, extension: ".js", itemNoun: "code" });

  tabs.setActive("codes");
}

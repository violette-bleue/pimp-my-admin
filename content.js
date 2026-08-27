/* point d'entrée, dispatch par mode de page. */

(async function () {
  const modules = chrome.runtime.getURL("modules/");
  const { buildPanel, showSourceInfo, buildFolderErrorMessage, setHeaderSource } = await import(modules + "shared/panel.js");
  const { extractTemplateRows } = await import(modules + "shared/categories.js");
  const { loadSource, forgetSource, buildFileIndex, resolveEditCategory } = await import(modules + "source/source.js");
  const { runEditPage } = await import(modules + "templates-sync/edit-page.js");
  const { runListPage } = await import(modules + "templates-sync/list-page.js");

  const editTplInput = document.querySelector('input[name="tpl_name"]');
  const editTextarea = document.getElementById("template");
  const isEditPage = !!(editTplInput && editTextarea);

  const listRows = extractTemplateRows(document, location.href);
  const isListPage = !isEditPage && listRows.length > 0;

  if (!isEditPage && !isListPage) return;

  const panel = buildPanel();
  document.body.appendChild(panel);

  if (isListPage) {
    await runListPage(panel, listRows);
    return;
  }

  const body = panel.querySelector("#pma-body");

  const source = await loadSource(body);
  if (!source) return;

  setHeaderSource(panel, source);

  showSourceInfo(body, source, async () => {
    await forgetSource();
    location.reload();
  });

  let index;
  try {
    index = await buildFileIndex(source);
  } catch (err) {
    console.error("Echec de lecture du dossier source ):", err);
    buildFolderErrorMessage(body, async () => {
      await forgetSource();
      location.reload();
    });
    return;
  }

  await runEditPage(panel, index, editTplInput.value, editTextarea, resolveEditCategory(document, location.href));
})();

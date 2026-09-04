/* Dispatch par page */

(async function () {
  const modules = chrome.runtime.getURL("modules/");
  const { buildPanel, showSourceInfo, buildFolderErrorMessage, setHeaderSource } = await import(modules + "shared/panel.js");
  const { extractTemplateRows } = await import(modules + "shared/categories.js");
  const { loadSource, forgetSource, buildFileIndex, resolveEditCategory } = await import(modules + "source/source.js");
  const { runEditPage } = await import(modules + "templates-sync/edit-page.js");
  const { runListPage } = await import(modules + "templates-sync/list-page.js");
  const { extractJsCodeRows, readCreateTrigger: readJsCreateTrigger } = await import(modules + "js-codes/rows.js");
  const { runJsCodesListPage } = await import(modules + "js-codes/list.js");
  const { extractHtmlPageRows, readCreateTrigger: readHtmlCreateTrigger } = await import(modules + "html-pages/rows.js");
  const { runHtmlPagesListPage } = await import(modules + "html-pages/list.js");
  const { runForumsHub } = await import(modules + "forums-hub/hub.js");

  const params = new URL(location.href).searchParams;

  if (params.get("part") === "general" && params.get("sub") === "general" && ["forum", "auth2"].includes(params.get("mode"))) {
    const panel = buildPanel();
    document.body.appendChild(panel);
    await runForumsHub(panel);
    return;
  }

  if (params.get("part") === "modules" && params.get("sub") === "html") {

    const mode = params.get("mode");
    if (mode === "js") {
      const panel = buildPanel();
      document.body.appendChild(panel);
      await runJsCodesListPage(panel, extractJsCodeRows(document, location.href), readJsCreateTrigger(document));
      return;
    }
    if (!mode) {
      const panel = buildPanel();
      document.body.appendChild(panel);
      await runHtmlPagesListPage(panel, extractHtmlPageRows(document, location.href), readHtmlCreateTrigger(document));
      return;
    }
  }

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
    index = await buildFileIndex(source, "templates", { withCategories: true });
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

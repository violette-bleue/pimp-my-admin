export function extractHtmlPageRows(doc, baseUrl) {
  const rows = [...doc.querySelectorAll("table tr")].filter((tr) => tr.querySelector('a[href*="mode=go_edit"]'));

  return rows.map((tr) => {
    const link = tr.querySelector('a[href*="mode=go_edit"]');
    const url = new URL(link.getAttribute("href"), baseUrl);
    url.searchParams.set("editor", "html"); // force HTML brut
    const cells = tr.querySelectorAll("td");
    const nameCell = cells[2];
    const name = nameCell ? nameCell.textContent.trim() : "";
    return { name, editUrl: url.href, nameCell, tr };
  });
}

// Déclencheur avancé
export function readCreateTrigger(doc) {
  return (
    [...doc.querySelectorAll("form")].find(
      (f) =>
        f.querySelector('input[name="mode"][value="go_add"]') && f.querySelector('input[name="editor"][value="html"]')
    ) || null
  );
}

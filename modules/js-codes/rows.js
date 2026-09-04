export function extractJsCodeRows(doc, baseUrl) {
  const rows = [...doc.querySelectorAll("table tr")].filter((tr) => tr.querySelector('a[href*="mode=js_edit"]'));

  return rows.map((tr) => {
    const link = tr.querySelector('a[href*="mode=js_edit"]');
    const editUrl = new URL(link.getAttribute("href"), baseUrl).href;
    const cells = tr.querySelectorAll("td");
    const nameCell = cells[1];
    const name = nameCell ? nameCell.textContent.trim() : "";
    return { name, editUrl, nameCell, tr };
  });
}

export function readCreateTrigger(doc) {
  return (
    [...doc.querySelectorAll("form")].find(
      (f) => f.querySelector('input[name="mode"][value="js_edit"]') && f.querySelector('input[name="add"]')
    ) || null
  );
}

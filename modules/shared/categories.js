export const CATEGORY_FOLDER_MAP = {
  Général: "general",
  Portail: "portail",
  Galerie: "galerie",
  Calendrier: "calendrier",
  Groupes: "groupes",
  "Poster & Messages privés": "poster-mp",
  Modération: "moderation",
  Profil: "profil",
  "Version mobile": "version-mobile",
};

export function slugifyCategory(label) {
  return (
    CATEGORY_FOLDER_MAP[label] ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

export function extractTemplateRows(doc, baseUrl) {
  const rows = [...doc.querySelectorAll("table tr")].filter((tr) => {
    const link = tr.querySelector("td a");
    if (!link) return false;
    const url = new URL(link.getAttribute("href"), baseUrl);
    return (url.searchParams.get("mode") || "").startsWith("edit_");
  });

  return rows.map((tr) => {
    const link = tr.querySelector("td a");
    const tplName = link.textContent.trim();
    const editUrl = new URL(link.getAttribute("href"), baseUrl).href;

    const publishLink = [...tr.querySelectorAll("a")].find((a) => a.querySelector("i.fa-check"));
    const publishUrl = publishLink ? new URL(publishLink.getAttribute("href"), baseUrl).href : null;
    const isPending = !!tr.querySelector(".tpl-wait");
    const isDefault = !tr.querySelector(".tpl-online") && !isPending;
    const nameCell = link.closest("td");

    return { tr, tplName, editUrl, publishUrl, isPending, isDefault, nameCell };
  });
}

export function extractCategoryLinks(doc, baseUrl) {
  const seen = new Map();
  for (const a of doc.querySelectorAll('a[href*="sub=templates"]')) {
    const url = new URL(a.getAttribute("href"), baseUrl);
    if (url.searchParams.get("sub") !== "templates") continue;
    const mode = url.searchParams.get("mode") || "";
    if (!mode || mode.startsWith("edit_")) continue;
    const label = a.textContent.trim();
    if (!label || label.length <= 2 || seen.has(mode)) continue;
    seen.set(mode, { label, url: url.href });
  }
  return [...seen.values()];
}

export function getCurrentCategoryLabel(doc, baseUrl) {
  const currentMode = new URL(baseUrl).searchParams.get("mode") || "";
  if (!currentMode) return null;
  const match = extractCategoryLinks(doc, baseUrl).find(
    (cat) => new URL(cat.url).searchParams.get("mode") === currentMode
  );
  return match ? match.label : null;
}

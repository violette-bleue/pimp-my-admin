import { extractCategoryLinks, extractTemplateRows, slugifyCategory } from "../shared/categories.js";
import { sleep } from "../shared/util.js";
import { resolveLocalFile } from "../source/source.js";
import { loadScanCache, saveScanCache, compareWithCache } from "./scan-cache.js";

export async function buildInventory(source, index, { seed, onProgress, sleepMs = 50 } = {}) {
  const categories = extractCategoryLinks(document, location.href);
  const scanCache = loadScanCache(source);
  const entries = [];

  if (seed && seed.category && seed.entries) {
    for (const row of seed.entries) entries.push({ ...row, category: seed.category });
  }

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];

    if (seed && seed.category === cat.label) {
      onProgress?.(cat.label, i + 1, categories.length, { reused: true });
      continue;
    }

    onProgress?.(cat.label, i + 1, categories.length, { reused: false });

    try {
      const res = await fetch(cat.url, { credentials: "include" });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const rows = extractTemplateRows(doc, cat.url);

      for (const row of rows) {
        const entry = { ...row, category: cat.label, status: "same" };
        const fileHandle = resolveLocalFile(index, row.tplName, slugifyCategory(cat.label));

        if (!fileHandle) {
          entry.status = "missing";
        } else {
          const result = await compareWithCache(fileHandle, row.tplName, row.editUrl, scanCache);
          entry.localContent = result.localContent;
          entry.mtime = result.mtime;
          entry.status = result.status;
          if (!result.fromCache) await sleep(sleepMs);
        }

        entries.push(entry);
      }
    } catch (err) {
      console.error("échec analyse catégorie ):", cat.label, err);
    }
  }

  saveScanCache(source, scanCache);
  return { entries, scanCache };
}

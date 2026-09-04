import { toCsv, fromCsv, downloadCsv } from "../shared/csv.js";
import { setIconContent, setProgress, setProgressState } from "../shared/dom.js";
import { sleep } from "../shared/util.js";
import { PERMISSIONS } from "./schema.js";
import { flattenTree, extractForumTree, depthOf } from "./rows.js";
import {
  fetchMetadata,
  pushMetadata,
  fetchAuthState,
  pushAuthState,
  deleteEntity,
  createEntity,
  fetchForumTreeDoc,
  StaleFormError,
} from "./network.js";
import { remapCsv, canonicalType, normText, entityKey, isTablerCsv, remapTablerCsv, flattenTablerRows } from "./csv-map.js";

const MODULE_KEY = "forums";
const FILE_NAME = "forums.csv";

const BASE_COLUMNS = ["id", "type", "category", "name", "main", "position", "status", "order_topics", "order_posts", "image", "desc"];
const PERM_COLUMNS = PERMISSIONS.flatMap((p) => [`${p.key}_guests`, `${p.key}_members`]);
const COLUMNS = [...BASE_COLUMNS, ...PERM_COLUMNS];

async function readFromSource(source) {
  if (!source) return null;
  if (source.type === "local") {
    try {
      const moduleHandle = await source.handle.getDirectoryHandle(MODULE_KEY);
      const fileHandle = await moduleHandle.getFileHandle(FILE_NAME);
      return await (await fileHandle.getFile()).text();
    } catch (err) {
      return null; // fichier absent
    }
  }
  const { owner, repo, branch, theme } = source;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${theme}/${MODULE_KEY}/${FILE_NAME}`;
  const res = await fetch(rawUrl);
  return res.ok ? res.text() : null;
}

async function resolveWritableFolder(source, progress) {
  if (source && source.type === "local") {
    let perm;
    try {
      perm = await source.handle.requestPermission({ mode: "readwrite" });
    } catch (err) {
      progress.textContent = "Impossible de demander la permission d'écriture (re-clique pour réessayer).";
      return null;
    }
    if (perm === "granted") return source.handle;
    progress.textContent = "Permission d'écriture refusée ):";
    return null;
  }

  progress.textContent = "Choisis le dossier de destination…";
  try {
    return await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (err) {
    return null;
  }
}

async function writeToFolder(rootHandle, csvText) {
  const moduleHandle = await rootHandle.getDirectoryHandle(MODULE_KEY, { create: true });
  const fileHandle = await moduleHandle.getFileHandle(FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(csvText);
  await writable.close();
}

// Candidats à supprimer
function computeWipeCandidates(entities, keptIds) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  function isDescendantOf(entity, ancestorId) {
    let cur = entity;
    while (cur && cur.parentId != null) {
      if (cur.parentId === ancestorId) return true;
      cur = byId.get(cur.parentId);
    }
    return false;
  }
  const missing = entities.filter((e) => !keptIds.has(e.id));
  return missing.filter((e) => !entities.some((k) => keptIds.has(k.id) && isDescendantOf(k, e.id)));
}

export function mountExportImport(container, { categories, rootCreateUrl, source }) {
  const entities = flattenTree(categories);

  const actions = document.createElement("div");
  actions.className = "pma-actions-even";
  container.appendChild(actions);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  setIconContent(saveBtn, "icons8-save-32", "Enregistrer dans le dossier source");

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  setIconContent(downloadBtn, "icons8-check-32", "Télécharger une copie");

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  setIconContent(loadBtn, "icons8-rocket-32", "Importer depuis le dossier source");

  const importLabel = document.createElement("label");
  importLabel.className = "pma-file-input";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".csv";
  const importText = document.createElement("span");
  importText.className = "pma-icon-label";
  setIconContent(importText, "icons8-folder-32", "Importer depuis un autre fichier");
  importLabel.append(importInput, importText);

  actions.append(saveBtn, downloadBtn, loadBtn, importLabel);

  const wipeLabel = document.createElement("label");
  wipeLabel.id = "pma-wipe-option";
  const wipeCheckbox = document.createElement("input");
  wipeCheckbox.type = "checkbox";
  wipeLabel.append(
    wipeCheckbox,
    document.createTextNode(
      " Remplacer la totalité au lieu d'ajouter à l'existant (supprime les catégories/forums absents du fichier importé — irréversible)"
    )
  );
  container.appendChild(wipeLabel);

  const progress = document.createElement("div");
  progress.className = "pma-scan-progress";
  progress.hidden = true;
  container.appendChild(progress);

  const logArea = document.createElement("textarea");
  logArea.id = "pma-mirror-sync-log";
  logArea.readOnly = true;
  container.appendChild(logArea);

  function logLine(text) {
    const time = new Date().toLocaleTimeString();
    logArea.value = `${time} — ${text}\n` + logArea.value;
  }

  function reportStale() {
    logLine("❌ Page périmée — recharge la page et réessaie.");
    setProgressState(progress, "error");
    progress.textContent = "Page périmée — recharge la page et réessaie.";
  }

  // Confirme le remplacement
  function confirmWipe(keptIds) {
    if (!wipeCheckbox.checked) return [];
    const toWipe = computeWipeCandidates(entities, keptIds);
    if (!toWipe.length) return [];
    const ok = confirm(
      `⚠️ Remplacement complet : ${toWipe.length} élément(s) absent(s) du fichier importé vont être supprimés définitivement :\n` +
        toWipe.map((e) => `- ${e.name}`).join("\n") +
        `\n\nCette action est IRRÉVERSIBLE. Confirmer la suppression ?`
    );
    return ok ? toWipe : [];
  }

  async function performWipe(toWipe) {
    const byIdAll = new Map(entities.map((e) => [e.id, e]));
    const sorted = [...toWipe].sort((a, b) => depthOf(a, byIdAll) - depthOf(b, byIdAll));
    const alreadyGone = new Set();
    let wiped = 0;
    let wipeFailed = 0;
    for (let i = 0; i < sorted.length; i++) {
      const entity = sorted[i];
      let cur = entity;
      let cascaded = false;
      while (cur && cur.parentId != null) {
        if (alreadyGone.has(cur.parentId)) {
          cascaded = true;
          break;
        }
        cur = byIdAll.get(cur.parentId);
      }
      if (cascaded) {
        alreadyGone.add(entity.id);
        continue;
      }
      setProgress(progress, `Suppression "${entity.name}" (${i + 1}/${sorted.length})…`);
      try {
        await deleteEntity(entity.deleteUrl);
        alreadyGone.add(entity.id);
        logLine(`🗑️ ${entity.name} — supprimé`);
        wiped++;
      } catch (err) {
        if (err instanceof StaleFormError) return { wiped, wipeFailed, stale: true };
        wipeFailed++;
        console.error("échec suppression ):", entity.name, err);
        logLine(`❌ ${entity.name} — échec de la suppression`);
      }
      await sleep(300);
    }
    return { wiped, wipeFailed };
  }

  async function buildCsv() {
    const rows = [];
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      setProgress(progress, `Lecture "${entity.name}" (${i + 1}/${entities.length})…`);

      const row = { id: entity.id, type: entity.type, category: entity.categoryLabel || "", name: entity.name };
      try {
        const meta = await fetchMetadata(entity.editUrl);
        Object.assign(row, {
          main: meta.main,
          position: meta.position,
          status: meta.status ?? "",
          order_topics: meta.orderTopics ?? "",
          order_posts: meta.orderPosts ?? "",
          image: meta.image ?? "",
          desc: meta.desc ?? "",
        });

        if (entity.authUrl) {
          const auth = await fetchAuthState(entity.authUrl);
          for (const p of PERMISSIONS) {
            row[`${p.key}_guests`] = auth.guests[p.key] ? "1" : "0";
            row[`${p.key}_members`] = auth.members[p.key] ? "1" : "0";
          }
        }
      } catch (err) {
        if (err instanceof StaleFormError) {
          reportStale();
          return null;
        }
        console.error("échec export ):", entity.name, err);
        logLine(`❌ ${entity.name} — échec de la récupération`);
      }

      rows.push(row);
      await sleep(100);
    }
    return toCsv(rows, COLUMNS);
  }

  async function applyCsv(text) {
    const parsed = fromCsv(text);
    if (!parsed.rows.length) {
      logLine("❌ Fichier vide ou illisible.");
      return;
    }

    if (isTablerCsv(parsed.columns)) {
      const { rows: tablerRows, unknownColumns } = remapTablerCsv(parsed);
      if (unknownColumns.length) {
        logLine(`ℹ️ Colonnes non reconnues, ignorées : ${unknownColumns.join(", ")}`);
      }
      await applyTablerSoft(flattenTablerRows(tablerRows));
      return;
    }

    const { columns, rows, unknownColumns } = remapCsv(parsed);
    if (unknownColumns.length) {
      logLine(`ℹ️ Colonnes non reconnues, ignorées : ${unknownColumns.join(", ")}`);
    }

    const byId = new Map(entities.map((e) => [e.id, e]));
    const usableId = columns.includes("id") && rows.some((r) => r.id && byId.has(r.id));

    if (usableId) await applyById(rows, columns, byId);
    else await applySoft(rows);
  }

  async function applyById(csvRows, columns, byId) {
    const touchPerms = columns.some((c) => PERM_COLUMNS.includes(c));
    const matched = [];
    let skipped = 0;

    for (const row of csvRows) {
      const entity = byId.get(row.id);
      if (!entity) {
        skipped++;
        continue;
      }
      matched.push({ entity, row });
    }

    const ok = confirm(
      `Import : ${matched.length} élément(s) reconnu(s) vont être mis à jour` +
        (skipped ? `, ${skipped} ligne(s) ignorée(s) (id introuvable — aucune création)` : "") +
        `.\nCeci écrase leurs métadonnées${touchPerms ? " et permissions" : ""} actuelles. Continuer ?`
    );
    if (!ok) return;

    const toWipe = confirmWipe(new Set(csvRows.map((r) => r.id).filter(Boolean)));

    let done = 0;
    let failed = 0;
    for (let i = 0; i < matched.length; i++) {
      const { entity, row } = matched[i];
      setProgress(progress, `Import "${entity.name}" (${i + 1}/${matched.length})…`);
      try {
        await pushMetadata(entity.editUrl, {
          name: row.name,
          main: row.main,
          position: row.position,
          status: row.status || null,
          orderTopics: row.order_topics || null,
          orderPosts: row.order_posts || null,
          image: row.image || null,
          desc: row.desc,
        });

        if (touchPerms && entity.authUrl) {
          const guests = {};
          const members = {};
          for (const p of PERMISSIONS) {
            guests[p.key] = row[`${p.key}_guests`] === "1";
            members[p.key] = row[`${p.key}_members`] === "1";
          }
          await pushAuthState(entity.authUrl, { guests, members });
        }

        logLine(`✅ ${entity.name} — importé`);
        done++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec import ):", entity.name, err);
        logLine(`❌ ${entity.name} — échec de l'import`);
      }
      await sleep(300);
    }

    const { wiped, wipeFailed, stale } = toWipe.length ? await performWipe(toWipe) : { wiped: 0, wipeFailed: 0 };
    if (stale) return reportStale();

    setProgressState(progress, failed || wipeFailed ? "error" : "done");
    progress.textContent =
      `Import terminé : ${done} mis à jour, ${failed} échec(s), ${skipped} ignoré(s)` +
      (toWipe.length ? `, ${wiped} supprimé(s), ${wipeFailed} échec(s) de suppression` : "") +
      ".";
  }

  // Import souple
  async function applySoft(csvRows) {
    const skippedSelects = csvRows.some((r) => r.order_topics || r.order_posts || r.status);
    const lines = csvRows.map((r) => ({
      type: canonicalType(r.type),
      category: (r.category || "").trim(),
      name: (r.name || "").trim(),
      desc: r.desc || "",
      image: r.image || "",
    }));

    const cats = lines.filter((l) => l.type === "category" && l.name);
    const forums = lines.filter((l) => l.type === "forum" && l.name);
    let ignored = lines.length - cats.length - forums.length;

    const keyOf = (e) => entityKey(e.type, e.type === "forum" ? e.categoryLabel || "" : "", e.name);
    let flat = entities;
    let existing = new Map(flat.map((e) => [keyOf(e), e]));

    const knownCatNames = new Set([
      ...flat.filter((e) => e.type === "category").map((e) => normText(e.name)),
      ...cats.map((c) => normText(c.name)),
    ]);

    const dedupe = (list, keyFn) => {
      const seen = new Set();
      return list.filter((x) => {
        const k = keyFn(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    const newCats = dedupe(
      cats.filter((c) => !existing.has(entityKey("category", "", c.name))),
      (c) => normText(c.name)
    );
    const placeableForums = forums.filter((f) => knownCatNames.has(normText(f.category)));
    ignored += forums.length - placeableForums.length;
    const newForums = dedupe(
      placeableForums.filter((f) => !existing.has(entityKey("forum", f.category, f.name))),
      (f) => entityKey("forum", f.category, f.name)
    );

    const updateCount =
      cats.filter((c) => existing.has(entityKey("category", "", c.name))).length +
      placeableForums.filter((f) => existing.has(entityKey("forum", f.category, f.name))).length;

    if (!newCats.length && !newForums.length && !updateCount) {
      logLine("❌ Rien d'exploitable dans ce fichier.");
      return;
    }
    if (newCats.length && !rootCreateUrl) {
      logLine("❌ Lien de création de catégorie introuvable sur cette page.");
      return;
    }

    const ok = confirm(
      `Import souple (sans id) :\n` +
        `• ${newCats.length} catégorie(s) créée(s)\n` +
        `• ${newForums.length} forum(s) créé(s)\n` +
        `• ${updateCount} élément(s) existant(s) : description / image mises à jour\n` +
        (ignored ? `• ${ignored} ligne(s) ignorée(s) (type inconnu, sans nom, ou catégorie absente)\n` : "") +
        `\nLes permissions ne sont pas touchées. Continuer ?`
    );
    if (!ok) return;
    if (skippedSelects) {
      logLine("ℹ️ Tri des sujets/messages et statut : non appliqués en mode souple (édition inline).");
    }

    // Entités protégées
    const keptIds = new Set([
      ...cats
        .filter((c) => existing.has(entityKey("category", "", c.name)))
        .map((c) => existing.get(entityKey("category", "", c.name)).id),
      ...placeableForums
        .filter((f) => existing.has(entityKey("forum", f.category, f.name)))
        .map((f) => existing.get(entityKey("forum", f.category, f.name)).id),
    ]);
    const toWipe = confirmWipe(keptIds);

    let created = 0;
    let updated = 0;
    let failed = 0;

    async function rescan() {
      const { doc, baseUrl } = await fetchForumTreeDoc();
      flat = flattenTree(extractForumTree(doc, baseUrl).categories);
      existing = new Map(flat.map((e) => [keyOf(e), e]));
    }

    for (let i = 0; i < newCats.length; i++) {
      const c = newCats[i];
      setProgress(progress, `Création catégorie "${c.name}" (${i + 1}/${newCats.length})…`);
      try {
        await createEntity(rootCreateUrl, { name: c.name, type: "c" });
        logLine(`✅ catégorie "${c.name}" — créée`);
        created++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec création catégorie ):", c.name, err);
        logLine(`❌ catégorie "${c.name}" — échec de création`);
      }
      await sleep(300);
    }
    if (newCats.length) await rescan().catch(() => {});

    for (let i = 0; i < newForums.length; i++) {
      const f = newForums[i];
      const parent = flat.find((e) => e.type === "category" && normText(e.name) === normText(f.category));
      if (!parent || !parent.createUrl) {
        failed++;
        logLine(`❌ forum "${f.name}" — catégorie "${f.category}" sans lien de création`);
        continue;
      }
      setProgress(progress, `Création forum "${f.name}" (${i + 1}/${newForums.length})…`);
      try {
        await createEntity(parent.createUrl, { name: f.name });
        logLine(`✅ forum "${f.name}" → ${f.category} — créé`);
        created++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec création forum ):", f.name, err);
        logLine(`❌ forum "${f.name}" — échec de création`);
      }
      await sleep(300);
    }
    if (newForums.length) await rescan().catch(() => {});

    const metaTargets = [
      ...cats.map((c) => ({ line: c, key: entityKey("category", "", c.name) })),
      ...placeableForums.map((f) => ({ line: f, key: entityKey("forum", f.category, f.name) })),
    ];
    for (const { line, key } of metaTargets) {
      const entity = existing.get(key);
      if (!entity || !entity.editUrl) continue;
      const fields = {};
      if (line.desc) fields.desc = line.desc;
      if (line.type === "forum" && line.image) fields.image = line.image;
      if (!Object.keys(fields).length) continue;
      setProgress(progress, `Métadonnées "${line.name}"…`);
      try {
        await pushMetadata(entity.editUrl, fields);
        updated++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec métadonnées ):", line.name, err);
        logLine(`❌ ${line.name} — échec des métadonnées`);
      }
      await sleep(300);
    }

    const { wiped, wipeFailed, stale } = toWipe.length ? await performWipe(toWipe) : { wiped: 0, wipeFailed: 0 };
    if (stale) return reportStale();

    setProgressState(progress, failed || wipeFailed ? "error" : "done");
    progress.textContent =
      `Import terminé : ${created} créé(s), ${updated} mis à jour, ${failed} échec(s)` +
      (ignored ? `, ${ignored} ignoré(s)` : "") +
      (toWipe.length ? `, ${wiped} supprimé(s), ${wipeFailed} échec(s) de suppression` : "") +
      (failed || wipeFailed ? "." : " — rechargement…");
    if (!failed && !wipeFailed) setTimeout(() => location.reload(), 1200);
  }

  // Import tabler
  async function applyTablerSoft(lines) {
    const cats = lines.filter((l) => l.type === "category" && l.name);
    const forums = lines.filter((l) => l.type === "forum" && l.name);
    const subforums = lines.filter((l) => l.type === "subforum" && l.name);

    const keyOf = (e) => entityKey(e.type, e.type === "forum" ? e.categoryLabel || "" : "", e.name);
    let flat = entities;
    let existing = new Map(flat.map((e) => [keyOf(e), e]));

    const knownCatNames = new Set([
      ...flat.filter((e) => e.type === "category").map((e) => normText(e.name)),
      ...cats.map((c) => normText(c.name)),
    ]);

    const dedupe = (list, keyFn) => {
      const seen = new Set();
      return list.filter((x) => {
        const k = keyFn(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    const newCats = dedupe(
      cats.filter((c) => !existing.has(entityKey("category", "", c.name))),
      (c) => normText(c.name)
    );
    const placeableForums = forums.filter((f) => knownCatNames.has(normText(f.category)));
    let ignored = forums.length - placeableForums.length;
    const newForums = dedupe(
      placeableForums.filter((f) => !existing.has(entityKey("forum", f.category, f.name))),
      (f) => entityKey("forum", f.category, f.name)
    );

    // Matching sous-forums
    const knownForumNames = new Set([
      ...flat.filter((e) => e.type === "forum").map((e) => normText(e.name)),
      ...forums.map((f) => normText(f.name)),
    ]);
    const placeableSubforums = subforums.filter((s) => s.forum && knownForumNames.has(normText(s.forum)));
    ignored += subforums.length - placeableSubforums.length;

    const findParentForum = (name) => flat.find((e) => e.type === "forum" && normText(e.name) === normText(name));
    const findExistingSubforum = (forumName, name) => {
      const parent = findParentForum(forumName);
      if (!parent) return null;
      return flat.find((e) => e.type === "forum" && e.parentId === parent.id && normText(e.name) === normText(name));
    };

    const newSubforums = dedupe(
      placeableSubforums.filter((s) => !findExistingSubforum(s.forum, s.name)),
      (s) => `${normText(s.forum)}::${normText(s.name)}`
    );

    const updateCount =
      cats.filter((c) => existing.has(entityKey("category", "", c.name))).length +
      placeableForums.filter((f) => existing.has(entityKey("forum", f.category, f.name))).length +
      (placeableSubforums.length - newSubforums.length);

    if (!newCats.length && !newForums.length && !newSubforums.length && !updateCount) {
      logLine("❌ Rien d'exploitable dans ce fichier.");
      return;
    }
    if (newCats.length && !rootCreateUrl) {
      logLine("❌ Lien de création de catégorie introuvable sur cette page.");
      return;
    }

    const ok = confirm(
      `Import souple (structure tableur) :\n` +
        `• ${newCats.length} catégorie(s) créée(s)\n` +
        `• ${newForums.length} forum(s) créé(s)\n` +
        `• ${newSubforums.length} sous-forum(s) créé(s)\n` +
        `• ${updateCount} élément(s) existant(s) : description / image mises à jour\n` +
        (ignored ? `• ${ignored} ligne(s) ignorée(s) (catégorie/forum parent introuvable)\n` : "") +
        `\nLes permissions ne sont pas touchées. Continuer ?`
    );
    if (!ok) return;

    // Entités protégées
    const keptIds = new Set([
      ...cats
        .filter((c) => existing.has(entityKey("category", "", c.name)))
        .map((c) => existing.get(entityKey("category", "", c.name)).id),
      ...placeableForums
        .filter((f) => existing.has(entityKey("forum", f.category, f.name)))
        .map((f) => existing.get(entityKey("forum", f.category, f.name)).id),
      ...placeableSubforums.map((s) => findExistingSubforum(s.forum, s.name)?.id).filter(Boolean),
    ]);
    const toWipe = confirmWipe(keptIds);

    let created = 0;
    let updated = 0;
    let failed = 0;

    async function rescan() {
      const { doc, baseUrl } = await fetchForumTreeDoc();
      flat = flattenTree(extractForumTree(doc, baseUrl).categories);
      existing = new Map(flat.map((e) => [keyOf(e), e]));
    }

    for (let i = 0; i < newCats.length; i++) {
      const c = newCats[i];
      setProgress(progress, `Création catégorie "${c.name}" (${i + 1}/${newCats.length})…`);
      try {
        await createEntity(rootCreateUrl, { name: c.name, type: "c" });
        logLine(`✅ catégorie "${c.name}" — créée`);
        created++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec création catégorie ):", c.name, err);
        logLine(`❌ catégorie "${c.name}" — échec de création`);
      }
      await sleep(300);
    }
    if (newCats.length) await rescan().catch(() => {});

    for (let i = 0; i < newForums.length; i++) {
      const f = newForums[i];
      const parent = flat.find((e) => e.type === "category" && normText(e.name) === normText(f.category));
      if (!parent || !parent.createUrl) {
        failed++;
        logLine(`❌ forum "${f.name}" — catégorie "${f.category}" sans lien de création`);
        continue;
      }
      setProgress(progress, `Création forum "${f.name}" (${i + 1}/${newForums.length})…`);
      try {
        await createEntity(parent.createUrl, { name: f.name });
        logLine(`✅ forum "${f.name}" → ${f.category} — créé`);
        created++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec création forum ):", f.name, err);
        logLine(`❌ forum "${f.name}" — échec de création`);
      }
      await sleep(300);
    }
    if (newForums.length) await rescan().catch(() => {});

    for (let i = 0; i < newSubforums.length; i++) {
      const s = newSubforums[i];
      const parent = findParentForum(s.forum);
      if (!parent || !parent.createUrl) {
        failed++;
        logLine(`❌ sous-forum "${s.name}" — forum parent "${s.forum}" sans lien de création`);
        continue;
      }
      setProgress(progress, `Création sous-forum "${s.name}" (${i + 1}/${newSubforums.length})…`);
      try {
        await createEntity(parent.createUrl, { name: s.name });
        logLine(`✅ sous-forum "${s.name}" → ${s.forum} — créé`);
        created++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec création sous-forum ):", s.name, err);
        logLine(`❌ sous-forum "${s.name}" — échec de création`);
      }
      await sleep(300);
    }
    if (newSubforums.length) await rescan().catch(() => {});

    const metaTargets = [
      ...cats.map((c) => ({ line: c, key: entityKey("category", "", c.name) })),
      ...placeableForums.map((f) => ({ line: f, key: entityKey("forum", f.category, f.name) })),
    ];
    for (const { line, key } of metaTargets) {
      const entity = existing.get(key);
      if (!entity || !entity.editUrl) continue;
      const fields = {};
      if (line.desc) fields.desc = line.desc;
      if (line.type === "forum" && line.image) fields.image = line.image;
      if (!Object.keys(fields).length) continue;
      setProgress(progress, `Métadonnées "${line.name}"…`);
      try {
        await pushMetadata(entity.editUrl, fields);
        updated++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec métadonnées ):", line.name, err);
        logLine(`❌ ${line.name} — échec des métadonnées`);
      }
      await sleep(300);
    }

    for (const s of placeableSubforums) {
      if (!s.desc && !s.image) continue;
      const entity = findExistingSubforum(s.forum, s.name);
      if (!entity || !entity.editUrl) continue;
      const fields = {};
      if (s.desc) fields.desc = s.desc;
      if (s.image) fields.image = s.image;
      setProgress(progress, `Métadonnées "${s.name}"…`);
      try {
        await pushMetadata(entity.editUrl, fields);
        updated++;
      } catch (err) {
        if (err instanceof StaleFormError) return reportStale();
        failed++;
        console.error("échec métadonnées ):", s.name, err);
        logLine(`❌ ${s.name} — échec des métadonnées`);
      }
      await sleep(300);
    }

    const { wiped, wipeFailed, stale } = toWipe.length ? await performWipe(toWipe) : { wiped: 0, wipeFailed: 0 };
    if (stale) return reportStale();

    setProgressState(progress, failed || wipeFailed ? "error" : "done");
    progress.textContent =
      `Import terminé : ${created} créé(s), ${updated} mis à jour, ${failed} échec(s)` +
      (ignored ? `, ${ignored} ignoré(s)` : "") +
      (toWipe.length ? `, ${wiped} supprimé(s), ${wipeFailed} échec(s) de suppression` : "") +
      (failed || wipeFailed ? "." : " — rechargement…");
    if (!failed && !wipeFailed) setTimeout(() => location.reload(), 1200);
  }

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    progress.hidden = false;
    setProgressState(progress, "running");
    try {
      const csvText = await buildCsv();
      if (csvText == null) return;
      const folder = await resolveWritableFolder(source, progress);
      if (!folder) {
        setProgressState(progress, "error");
        return;
      }
      await writeToFolder(folder, csvText);
      setProgressState(progress, "done");
      progress.textContent = `Enregistré dans "${folder.name}/${MODULE_KEY}/${FILE_NAME}" — ${entities.length} élément(s).`;
    } finally {
      saveBtn.disabled = false;
    }
  });

  downloadBtn.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    progress.hidden = false;
    setProgressState(progress, "running");
    try {
      const csvText = await buildCsv();
      if (csvText == null) return;
      downloadCsv("pimp-my-forum-hub.csv", csvText);
      setProgressState(progress, "done");
      progress.textContent = `Téléchargé : ${entities.length} élément(s).`;
    } finally {
      downloadBtn.disabled = false;
    }
  });

  loadBtn.addEventListener("click", async () => {
    loadBtn.disabled = true;
    progress.hidden = false;
    setProgressState(progress, "running");
    progress.textContent = "Lecture du dossier source…";
    try {
      const text = await readFromSource(source);
      if (text == null) {
        setProgressState(progress, "error");
        progress.textContent = `Aucun fichier "${MODULE_KEY}/${FILE_NAME}" trouvé dans le dossier source.`;
        return;
      }
      await applyCsv(text);
    } finally {
      loadBtn.disabled = false;
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";
    if (!file) return;
    progress.hidden = false;
    setProgressState(progress, "running");
    await applyCsv(await file.text());
  });
}

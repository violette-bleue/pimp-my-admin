/* Tolérance en-têtes CSV */

import { PERMISSIONS } from "./schema.js";

export function normText(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

const HEADER_ALIASES = {
  id: ["id"],
  type: ["type", "kind", "nature"],
  category: ["category", "categorie", "cat", "parent", "rubrique"],
  name: ["name", "nom", "titre", "intitule", "libelle"],
  main: ["main"],
  position: ["position", "ordre", "order"],
  status: ["status", "statut", "etat"],
  order_topics: ["order topics", "tri sujets", "ordre sujets", "tri des sujets"],
  order_posts: ["order posts", "tri messages", "ordre messages", "tri des messages"],
  image: ["image", "icone", "logo", "illustration"],
  desc: ["desc", "description", "descriptif"],
};

const PERM_KEYS = new Set(PERMISSIONS.flatMap((p) => [`${p.key}_guests`, `${p.key}_members`]));

const HEADER_LOOKUP = (() => {
  const m = new Map();
  for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) m.set(normText(a), canon);
  }
  return m;
})();

export function canonicalHeader(raw) {
  const lower = raw.trim().toLowerCase();
  if (PERM_KEYS.has(lower)) return lower;
  return HEADER_LOOKUP.get(normText(raw)) || null;
}

const TYPE_ALIASES = {
  category: ["c", "cat", "categorie", "category", "rubrique"],
  forum: ["f", "forum"],
  blog: ["b", "blog"],
  annonces: ["d", "annonces", "petites annonces"],
};

const TYPE_LOOKUP = (() => {
  const m = new Map();
  for (const [canon, aliases] of Object.entries(TYPE_ALIASES)) {
    for (const a of aliases) m.set(normText(a), canon);
  }
  return m;
})();

export const FA_TYPE_CODE = { category: "c", forum: "f", blog: "b", annonces: "d" };

export function canonicalType(raw) {
  return TYPE_LOOKUP.get(normText(raw)) || null;
}

// Colonnes -> clés canoniques
export function remapCsv({ columns, rows }) {
  const mapping = [];
  const unknownColumns = [];
  columns.forEach((col) => {
    const canon = canonicalHeader(col);
    if (canon) mapping.push([col, canon]);
    else if (col) unknownColumns.push(col);
  });

  const canonRows = rows.map((row) => {
    const out = {};
    for (const [col, canon] of mapping) out[canon] = row[col] ?? "";
    return out;
  });

  return { columns: [...new Set(mapping.map(([, c]) => c))], rows: canonRows, unknownColumns };
}

// Clé sans id
export function entityKey(type, category, name) {
  return `${type} ${normText(category)} ${normText(name)}`;
}

// -- Import tabler --

const TABLER_ALIASES = {
  category: ["category", "categorie", "cat", "rubrique"],
  forum: ["forum", "forums"],
  subforum: ["sous forum", "sous forums", "subforum", "subforums", "sub forum", "sub forums"],
  image: ["image", "icone", "logo", "illustration"],
  desc: ["desc", "description", "descriptif"],
};

const TABLER_LOOKUP = (() => {
  const m = new Map();
  for (const [canon, aliases] of Object.entries(TABLER_ALIASES)) {
    for (const a of aliases) m.set(normText(a), canon);
  }
  return m;
})();

function canonicalTablerHeader(raw) {
  return TABLER_LOOKUP.get(normText(raw)) || null;
}

// Signature CSV tabler
export function isTablerCsv(columns) {
  const canon = new Set(columns.map(canonicalTablerHeader).filter(Boolean));
  return canon.has("forum") && canon.has("subforum");
}

export function remapTablerCsv({ columns, rows }) {
  const mapping = [];
  const unknownColumns = [];
  columns.forEach((col) => {
    const canon = canonicalTablerHeader(col);
    if (canon) mapping.push([col, canon]);
    else if (col) unknownColumns.push(col);
  });

  const canonRows = rows.map((row) => {
    const out = {};
    for (const [col, canon] of mapping) out[canon] = row[col] ?? "";
    return out;
  });

  return { rows: canonRows, unknownColumns };
}

// Aplatit lignes tabler
export function flattenTablerRows(rows) {
  const lines = [];
  let currentCategory = null;
  let currentForum = null;

  for (const row of rows) {
    const category = (row.category || "").trim();
    const forum = (row.forum || "").trim();
    const subforum = (row.subforum || "").trim();
    const image = (row.image || "").trim();
    const desc = (row.desc || "").trim();

    if (category) {
      currentCategory = category;
      currentForum = null;
      lines.push({ type: "category", category: null, forum: null, name: category, image, desc });
      continue;
    }

    if (forum) {
      currentForum = forum;
      lines.push({ type: "forum", category: currentCategory, forum: null, name: forum, image, desc });
      for (const name of subforum.split(",").map((s) => s.trim()).filter(Boolean)) {
        lines.push({ type: "subforum", category: currentCategory, forum: currentForum, name, image: "", desc: "" });
      }
      continue;
    }

    if (subforum) {
      for (const name of subforum.split(",").map((s) => s.trim()).filter(Boolean)) {
        lines.push({ type: "subforum", category: currentCategory, forum: currentForum, name, image, desc });
      }
    }
  }

  return lines;
}

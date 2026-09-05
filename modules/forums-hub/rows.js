function extractActions(p, baseUrl) {
  const actions = {};
  for (const a of p.querySelectorAll(".forum_actions a")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    const url = new URL(href, baseUrl);
    const mode = url.searchParams.get("mode");
    if (mode === "auth") url.searchParams.set("extended_auth", "1");
    actions[mode || "view"] = url.href;
  }
  return actions;
}

function entityType(el) {
  return el.className.trim().split(/\s+/)[0] === "cat" ? "category" : "forum";
}

// Nom entre parenthèses
function cleanName(raw) {
  const t = raw.trim();
  const m = t.match(/^\( (.+) \)$/);
  return m ? m[1] : t;
}

// Hiérarchie via data-parent
function readEntity(el, baseUrl) {
  const p = el.querySelector(":scope > p.cat_for");
  const nameSpan = [...p.children].find((c) => c.tagName === "SPAN" && c.className === "");
  const actions = extractActions(p, baseUrl);
  const editUrl = actions.edit || null;
  const id = el.dataset.id || (editUrl ? new URL(editUrl).searchParams.get("fid") : null);

  return {
    id,
    parentId: el.dataset.parent || null,
    type: entityType(el),
    name: nameSpan ? cleanName(nameSpan.textContent) : "",
    viewUrl: actions.view || null,
    createUrl: actions.create || null,
    editUrl,
    authUrl: actions.auth || null,
    deleteUrl: actions.delete || null,
  };
}

function readRootCreateUrl(doc, baseUrl) {
  const p = doc.querySelector(".website > p");
  if (!p) return null;
  for (const a of p.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    if (href && new URL(href, baseUrl).searchParams.get("mode") === "create") return new URL(href, baseUrl).href;
  }
  return null;
}

export function extractForumTree(doc, baseUrl) {
  const toplevel = doc.querySelector(".sort_el.toplevel");
  if (!toplevel) return { categories: [], rootCreateUrl: null };

  // Traverse le sous-arbre
  const nodes = new Map();
  for (const el of toplevel.querySelectorAll(".dragBlock")) {
    const entity = readEntity(el, baseUrl);
    if (entity.type === "category") entity.forums = [];
    else entity.children = [];
    nodes.set(entity.id, entity);
  }

  const categories = [];
  for (const entity of nodes.values()) {
    if (entity.type === "category") {
      categories.push(entity);
      continue;
    }
    const parent = entity.parentId ? nodes.get(entity.parentId) : null;
    if (!parent) continue; // orphelin ignoré
    if (parent.type === "category") parent.forums.push(entity);
    else parent.children.push(entity);
  }

  return { categories, rootCreateUrl: readRootCreateUrl(doc, baseUrl) };
}

// Profondeur (parentId)
export function depthOf(entity, byId) {
  let depth = 0;
  let cur = entity;
  while (cur && cur.parentId != null) {
    depth++;
    cur = byId.get(cur.parentId);
  }
  return depth;
}

export function flattenTree(categories) {
  const out = [];
  function visitForums(forums, categoryLabel) {
    for (const f of forums) {
      out.push({ ...f, categoryLabel });
      if (f.children?.length) visitForums(f.children, categoryLabel);
    }
  }
  for (const cat of categories) {
    out.push({ ...cat, categoryLabel: null });
    visitForums(cat.forums, cat.name);
  }
  return out;
}

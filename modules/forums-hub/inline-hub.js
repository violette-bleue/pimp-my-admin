import { PERMISSIONS, LEVELS, LEVEL_LABELS, ESSENTIAL_PERMISSIONS, computeLevel } from "./schema.js";
import { fetchAuthState, pushSinglePermission, pushMetadata, createEntity, StaleFormError } from "./network.js";
import { mountMetadataPanel } from "./metadata-panel.js";
import { sleep } from "../shared/util.js";

const CACHE_KEY = "pma-forums-hub-auth-cache";

function loadCache() {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}");
  } catch (err) {
    return {};
  }
}

function saveCache(cache) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    // intentionnel
  }
}

function renderPermCell(td, entity, permKey, state, cache) {
  td.innerHTML = "";

  const level = computeLevel(state, permKey);
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "pma-perm-badge pma-perm-badge--" + level;
  badge.textContent = LEVEL_LABELS[level];
  td.appendChild(badge);

  badge.addEventListener("click", () => {
    td.innerHTML = "";
    const select = document.createElement("select");
    for (const lvl of LEVELS) {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = LEVEL_LABELS[lvl];
      if (lvl === level) opt.selected = true;
      select.appendChild(opt);
    }
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.textContent = "✓";
    td.append(select, okBtn);
    select.focus();

    okBtn.addEventListener("click", async () => {
      okBtn.disabled = true;
      try {
        await pushSinglePermission(entity.authUrl, permKey, select.value);
        state.guests[permKey] = select.value === "guest";
        state.members[permKey] = select.value === "guest" || select.value === "member";
        cache[entity.id] = state;
        saveCache(cache);
        renderPermCell(td, entity, permKey, state, cache);
      } catch (err) {
        console.error("échec changement permission ):", entity.name, permKey, err);
        alert(err instanceof StaleFormError ? err.message : "Échec de l'enregistrement ):");
        renderPermCell(td, entity, permKey, state, cache);
      }
    });
  });
}

function permColClass(key) {
  return "pma-perm-col pma-perm-col--" + key + (ESSENTIAL_PERMISSIONS.has(key) ? " pma-perm-col--essential" : "");
}

async function renderForumPermCells(tr, entity, cache) {
  const cells = PERMISSIONS.map((p) => {
    const td = document.createElement("td");
    td.className = permColClass(p.key);
    td.textContent = "…";
    tr.appendChild(td);
    return td;
  });

  let state = cache[entity.id];
  if (!state) {
    try {
      state = await fetchAuthState(entity.authUrl);
      cache[entity.id] = state;
      saveCache(cache);
    } catch (err) {
      console.error("échec chargement permissions ):", entity.name, err);
      const title = err instanceof StaleFormError ? err.message : "";
      cells.forEach((td) => {
        td.textContent = "?";
        if (title) td.title = title;
      });
      return;
    }
  }

  PERMISSIONS.forEach((p, i) => renderPermCell(cells[i], entity, p.key, state, cache));
}

function buildHeaderRow() {
  const tr = document.createElement("tr");
  tr.appendChild(document.createElement("th"));
  const nameTh = document.createElement("th");
  nameTh.textContent = "Nom";
  tr.appendChild(nameTh);
  for (const p of PERMISSIONS) {
    const th = document.createElement("th");
    th.className = permColClass(p.key);
    th.title = p.label;
    th.textContent = p.short;
    tr.appendChild(th);
  }
  return tr;
}

// -- Arbre en mémoire --

function findContainer(categories, parentId) {
  if (parentId == null) return null;
  for (const cat of categories) {
    if (cat.id === parentId) return cat.forums;
    const found = findInForums(cat.forums, parentId);
    if (found) return found;
  }
  return null;
}

function findInForums(forums, parentId) {
  for (const f of forums) {
    if (f.id === parentId) {
      f.children = f.children || [];
      return f.children;
    }
    const nested = findInForums(f.children || [], parentId);
    if (nested) return nested;
  }
  return null;
}

function removeEntity(categories, entityId) {
  for (const cat of categories) {
    const idx = cat.forums.findIndex((f) => f.id === entityId);
    if (idx !== -1) return cat.forums.splice(idx, 1)[0];
    const found = removeFromForums(cat.forums, entityId);
    if (found) return found;
  }
  return null;
}

function removeFromForums(forums, entityId) {
  for (const f of forums) {
    const children = f.children || [];
    const idx = children.findIndex((c) => c.id === entityId);
    if (idx !== -1) return children.splice(idx, 1)[0];
    const found = removeFromForums(children, entityId);
    if (found) return found;
  }
  return null;
}

// -- Création inline --

function mountInlineCreate(host, { createUrl, type, label }) {
  const openLink = document.createElement("a");
  openLink.href = "#";
  openLink.textContent = label;
  host.appendChild(openLink);

  openLink.addEventListener("click", (e) => {
    e.preventDefault();
    openLink.hidden = true;

    const form = document.createElement("span");
    form.className = "pma-hub-create-form";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Nom…";
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.textContent = "Créer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Annuler";
    form.append(input, okBtn, cancelBtn);
    host.appendChild(form);
    input.focus();

    cancelBtn.addEventListener("click", () => {
      form.remove();
      openLink.hidden = false;
    });

    okBtn.addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) return;
      okBtn.disabled = true;
      try {
        await createEntity(createUrl, { name, type });
        location.reload();
      } catch (err) {
        console.error("échec création ):", name, err);
        alert(err instanceof StaleFormError ? err.message : "Échec de la création ):");
        okBtn.disabled = false;
      }
    });
  });
}

// -- Construction des lignes --

function buildAddRow(categoryEntity, depth) {
  const tr = document.createElement("tr");
  tr.className = "pma-hub-row pma-hub-row--add";
  tr.appendChild(document.createElement("td"));
  const td = document.createElement("td");
  td.colSpan = PERMISSIONS.length + 1;
  td.style.paddingLeft = depth * 16 + "px";
  if (categoryEntity.createUrl) {
    mountInlineCreate(td, { createUrl: categoryEntity.createUrl, label: "+ Ajouter un forum ici" });
  }
  tr.appendChild(td);
  return tr;
}

function buildEntityRow(entity, depth, ctx, isLast) {
  const tr = document.createElement("tr");
  tr.className = "pma-hub-row pma-hub-row--" + entity.type;
  tr.dataset.id = entity.id;
  // Niveau sous-forum
  if (depth >= 2) tr.dataset.sub = depth - 1;
  // Dernier de liste
  if (isLast) tr.dataset.last = "";

  const checkTd = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "pma-hub-select";
  checkbox.checked = ctx.selection.has(entity.id);
  checkbox.title =
    entity.type === "category" ? "Sélectionner la catégorie et ses forums" : "Sélectionner";
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) ctx.selection.set(entity.id, entity);
    else ctx.selection.delete(entity.id);
    if (entity.type === "category") {
      for (const [id, cb] of ctx.checkboxesByEntity) {
        const e = ctx.entityById.get(id);
        if (!e || e === entity || !isDescendantOfCategory(ctx, e, entity.id)) continue;
        if (cb.checked !== checkbox.checked) {
          cb.checked = checkbox.checked;
          cb.dispatchEvent(new Event("change"));
        }
      }
    }
  });
  ctx.checkboxesByEntity.set(entity.id, checkbox);
  checkTd.appendChild(checkbox);
  tr.appendChild(checkTd);

  const nameTd = document.createElement("td");
  nameTd.className = "pma-hub-name";
  nameTd.style.paddingLeft = depth * 16 + "px";
  const nameLink = document.createElement("a");
  nameLink.href = "#";
  nameLink.textContent = entity.name;
  nameTd.appendChild(nameLink);
  tr.appendChild(nameTd);

  if (entity.type === "forum" && entity.authUrl) {
    renderForumPermCells(tr, entity, ctx.cache);
  } else {
    const spanTd = document.createElement("td");
    spanTd.colSpan = PERMISSIONS.length;
    spanTd.className = "pma-hub-category-label";
    tr.appendChild(spanTd);
  }

  const detailTr = document.createElement("tr");
  detailTr.className = "pma-hub-detail-row";
  detailTr.hidden = true;
  const detailTd = document.createElement("td");
  detailTd.colSpan = PERMISSIONS.length + 2;
  detailTr.appendChild(detailTd);

  nameLink.addEventListener("click", (e) => {
    e.preventDefault();
    const wasHidden = detailTr.hidden;
    detailTr.hidden = false;
    if (wasHidden) mountMetadataPanel(detailTd, entity);
    else detailTr.hidden = true;
  });

  // -- Drag & drop --
  if (entity.type === "forum") {
    tr.draggable = true;
    tr.addEventListener("dragstart", (e) => {
      ctx.draggedId = entity.id;
      e.dataTransfer.effectAllowed = "move";
    });
  }

  if (entity.type === "forum" || entity.type === "category") {
    tr.addEventListener("dragover", (e) => {
      if (!ctx.draggedId || ctx.draggedId === entity.id) return;
      e.preventDefault();
      tr.classList.remove("pma-drop-before", "pma-drop-after", "pma-drop-nest");
      if (entity.type === "category") {
        tr.classList.add("pma-drop-nest");
        return;
      }
      const rect = tr.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      if (ratio < 0.25) tr.classList.add("pma-drop-before");
      else if (ratio > 0.75) tr.classList.add("pma-drop-after");
      else tr.classList.add("pma-drop-nest");
    });
    tr.addEventListener("dragleave", () => {
      tr.classList.remove("pma-drop-before", "pma-drop-after", "pma-drop-nest");
    });
    tr.addEventListener("drop", (e) => {
      e.preventDefault();
      const zone = tr.classList.contains("pma-drop-before")
        ? "before"
        : tr.classList.contains("pma-drop-after")
        ? "after"
        : "nest";
      tr.classList.remove("pma-drop-before", "pma-drop-after", "pma-drop-nest");
      if (!ctx.draggedId || ctx.draggedId === entity.id) return;
      ctx.onDrop(ctx.draggedId, entity, zone);
      ctx.draggedId = null;
    });
  }

  return [tr, detailTr];
}

function isDescendantOfCategory(ctx, entity, categoryId) {
  let cur = entity;
  while (cur && cur.parentId != null) {
    if (cur.parentId === categoryId) return true;
    cur = ctx.entityById.get(cur.parentId);
  }
  return false;
}

function indexEntities(categories, map) {
  for (const cat of categories) {
    map.set(cat.id, cat);
    indexForums(cat.forums, map);
  }
}
function indexForums(forums, map) {
  for (const f of forums) {
    map.set(f.id, f);
    indexForums(f.children || [], map);
  }
}

// -- Rendu global --

function buildInlineHubContent(categories, rootCreateUrl, selection) {
  const root = document.createElement("div");
  root.id = "pma-hub-content";

  const toolbar = document.createElement("div");
  toolbar.className = "pma-hub-toolbar";
  root.appendChild(toolbar);

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.textContent = "Tout sélectionner";
  toolbar.appendChild(selectAllBtn);

  const deselectAllBtn = document.createElement("button");
  deselectAllBtn.type = "button";
  deselectAllBtn.textContent = "Tout désélectionner";
  toolbar.appendChild(deselectAllBtn);

  const essentialToggle = document.createElement("button");
  essentialToggle.type = "button";
  essentialToggle.textContent = "Permissions essentielles";
  toolbar.appendChild(essentialToggle);

  if (rootCreateUrl) {
    const addCatHost = document.createElement("span");
    toolbar.appendChild(addCatHost);
    mountInlineCreate(addCatHost, { createUrl: rootCreateUrl, type: "c", label: "+ Ajouter une catégorie" });
  }

  const validateBtn = document.createElement("button");
  validateBtn.type = "button";
  validateBtn.hidden = true;
  toolbar.appendChild(validateBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Annuler";
  cancelBtn.hidden = true;
  toolbar.appendChild(cancelBtn);

  const status = document.createElement("div");
  status.className = "pma-scan-progress";
  status.hidden = true;
  root.appendChild(status);

  const table = document.createElement("table");
  table.className = "pma-hub-table";
  const thead = document.createElement("thead");
  thead.appendChild(buildHeaderRow());
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  root.appendChild(table);

  const cache = loadCache();
  const entityById = new Map();
  indexEntities(categories, entityById);

  const movedIds = new Set();

  const ctx = {
    cache,
    selection,
    entityById,
    checkboxesByEntity: new Map(),
    draggedId: null,
    onDrop(draggedId, target, zone) {
      const dragged = removeEntity(categories, draggedId);
      if (!dragged) return;

      let newParentId;
      let insertIndex;
      let container;

      if (target.type === "category" || zone === "nest") {
        newParentId = target.id;
        container = target.type === "category" ? target.forums : (target.children = target.children || []);
        insertIndex = 0;
      } else {
        newParentId = target.parentId;
        container = findContainer(categories, newParentId);
        const idx = container.indexOf(target);
        insertIndex = zone === "before" ? idx : idx + 1;
      }

      dragged.parentId = newParentId;
      container.splice(insertIndex, 0, dragged);
      movedIds.add(dragged.id);

      renderTable();
      refreshValidateButton();
    },
  };

  function refreshValidateButton() {
    validateBtn.hidden = movedIds.size === 0;
    cancelBtn.hidden = movedIds.size === 0;
    validateBtn.textContent = `Valider l'ordre (${movedIds.size})`;
  }

  function computePositionValue(entity) {
    const container = entity.parentId == null ? categories : findContainer(categories, entity.parentId) || [];
    const idx = container.indexOf(entity);
    if (idx <= 0) return entity.parentId; // 1er de liste
    return container[idx - 1].id;
  }

  validateBtn.addEventListener("click", async () => {
    const ok = confirm(`Appliquer ${movedIds.size} changement(s) d'ordre/de rattachement sur le forum ?`);
    if (!ok) return;

    root.classList.add("pma-hub-locked");
    status.hidden = false;
    status.textContent = "Application en cours…";
    status.classList.add("pma-scan-progress--running");

    // Haut en bas
    const orderedMoved = [];
    (function walk(forums) {
      for (const f of forums) {
        if (movedIds.has(f.id)) orderedMoved.push(f);
        walk(f.children || []);
      }
    })(categories.flatMap((c) => c.forums));

    let failed = 0;
    for (let i = 0; i < orderedMoved.length; i++) {
      const entity = orderedMoved[i];
      status.textContent = `"${entity.name}" (${i + 1}/${orderedMoved.length})…`;
      try {
        const position = computePositionValue(entity);
        await pushMetadata(entity.editUrl, { main: entity.parentId, position });
      } catch (err) {
        if (err instanceof StaleFormError) {
          status.classList.remove("pma-scan-progress--running");
          status.textContent = err.message;
          root.classList.remove("pma-hub-locked");
          return;
        }
        failed++;
        console.error("échec réordonnancement ):", entity.name, err);
      }
      await sleep(300);
    }

    status.classList.remove("pma-scan-progress--running");
    status.textContent = failed ? `${failed} échec(s) — recharge la page pour vérifier l'état réel.` : "Ordre appliqué — rechargement…";
    if (!failed) setTimeout(() => location.reload(), 900);
    else root.classList.remove("pma-hub-locked");
  });

  cancelBtn.addEventListener("click", () => location.reload());

  function renderTable() {
    tbody.innerHTML = "";
    ctx.checkboxesByEntity.clear();

    function renderForums(forums, depth) {
      forums.forEach((f, i) => {
        const [tr, detailTr] = buildEntityRow(f, depth, ctx, i === forums.length - 1);
        tbody.append(tr, detailTr);
        if (f.children?.length) renderForums(f.children, depth + 1);
      });
    }

    for (const cat of categories) {
      const [tr, detailTr] = buildEntityRow(cat, 0, ctx);
      tbody.append(tr, detailTr);
      renderForums(cat.forums, 1);
      tbody.appendChild(buildAddRow(cat, 1));
    }
  }

  renderTable();

  selectAllBtn.addEventListener("click", () => {
    for (const cb of ctx.checkboxesByEntity.values()) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    }
  });
  deselectAllBtn.addEventListener("click", () => {
    for (const cb of ctx.checkboxesByEntity.values()) {
      cb.checked = false;
      cb.dispatchEvent(new Event("change"));
    }
  });

  essentialToggle.addEventListener("click", () => {
    root.classList.toggle("pma-hub-essential-only");
  });

  return { root };
}

export function injectInlineHub({ categories, rootCreateUrl }) {
  const menuBody = document.getElementById("menu-body");
  const panelMenu = document.querySelector(".panel_menu");
  if (!menuBody || !panelMenu) return null;

  const selection = new Map();
  const { root: content } = buildInlineHubContent(categories, rootCreateUrl, selection);
  content.hidden = true;
  panelMenu.insertAdjacentElement("afterend", content);

  let showingHub = false;

  function setActive(active) {
    if (active === showingHub) return;
    showingHub = active;
    panelMenu.hidden = active;
    content.hidden = !active;
  }

  setActive(true);

  return {
    getSelectedEntities: () => [...selection.values()],
    setActive,
  };
}

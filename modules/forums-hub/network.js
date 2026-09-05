import { PERMISSIONS, AUDIENCE_PRESETS, stateFromLevel } from "./schema.js";

// Page/session périmée
export class StaleFormError extends Error {
  constructor() {
    super("Page périmée — recharge la page et réessaie.");
    this.name = "StaleFormError";
  }
}

async function loadForm(url) {
  const res = await fetch(url, { credentials: "include" });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const form = doc.forms["edit"];
  if (!form) throw new StaleFormError();
  return form;
}

async function submitForm(form, baseUrl, overrides, submitValue = "Enregistrer") {
  const data = new FormData(form);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) data.delete(key);
    else data.set(key, value);
  }
  data.set("update", submitValue);
  const action = new URL(form.getAttribute("action"), baseUrl).href;
  const res = await fetch(action, { method: "POST", credentials: "include", body: data });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

export async function fetchForumTreeDoc() {
  const url = new URL(location.href);
  url.searchParams.set("mode", "forum");
  const res = await fetch(url.href, { credentials: "include" });
  const html = await res.text();
  return { doc: new DOMParser().parseFromString(html, "text/html"), baseUrl: url.href };
}

export async function fetchMetadata(editUrl) {
  const form = await loadForm(editUrl);
  const get = (name) => form.querySelector(`[name="${name}"]`)?.value ?? "";
  const has = (name) => !!form.querySelector(`[name="${name}"]`);
  return {
    name: get("name"),
    main: get("main"),
    position: get("position"),
    status: has("status") ? get("status") : null,
    orderTopics: has("order_topics") ? get("order_topics") : null,
    orderPosts: has("order_posts") ? get("order_posts") : null,
    image: has("image") ? get("image") : null,
    desc: get("desc"),
    mainOptions: [...form.querySelector('[name="main"]').options].map((o) => ({ value: o.value, label: o.textContent.trim() })),
    positionOptions: [...form.querySelector('[name="position"]').options].map((o) => ({ value: o.value, label: o.textContent.trim() })),
    statusOptions: has("status") ? [...form.querySelector('[name="status"]').options].map((o) => ({ value: o.value, label: o.textContent.trim() })) : [],
    orderTopicsOptions: has("order_topics") ? [...form.querySelector('[name="order_topics"]').options].map((o) => ({ value: o.value, label: o.textContent.trim() })) : [],
    orderPostsOptions: has("order_posts") ? [...form.querySelector('[name="order_posts"]').options].map((o) => ({ value: o.value, label: o.textContent.trim() })) : [],
  };
}

// Simule onchange natif
export async function refetchPositionOptions(editUrl, newMain) {
  const form = await loadForm(editUrl);
  const data = new FormData(form);
  data.set("main", newMain);
  data.delete("update");
  const action = new URL(form.getAttribute("action"), editUrl).href;
  const res = await fetch(action, { method: "POST", credentials: "include", body: data });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const refreshed = doc.forms["edit"];
  if (!refreshed) throw new Error("formulaire introuvable après changement de catégorie");
  return [...refreshed.querySelector('[name="position"]').options].map((o) => ({ value: o.value, label: o.textContent.trim() }));
}

export async function pushMetadata(editUrl, fields) {
  const form = await loadForm(editUrl);
  const overrides = {};
  if (fields.name != null) overrides.name = fields.name;
  if (fields.main != null) overrides.main = fields.main;
  if (fields.position != null) overrides.position = fields.position;
  if (fields.status != null) overrides.status = fields.status;
  if (fields.orderTopics != null) overrides.order_topics = fields.orderTopics;
  if (fields.orderPosts != null) overrides.order_posts = fields.orderPosts;
  if (fields.image != null) overrides.image = fields.image;
  if (fields.desc != null) overrides.desc = fields.desc;
  return submitForm(form, editUrl, overrides);
}

// Groupes perso ignorés
export async function fetchAuthState(authUrl) {
  const form = await loadForm(authUrl);
  const guests = {};
  const members = {};
  for (const p of PERMISSIONS) {
    guests[p.key] = !!form.querySelector(`[name="${p.key}_guests"]`)?.checked;
    members[p.key] = !!form.querySelector(`[name="${p.key}_members"]`)?.checked;
  }
  return { guests, members };
}

// Une seule permission
export async function pushSinglePermission(authUrl, permKey, level) {
  const form = await loadForm(authUrl);
  const { guest, member } = stateFromLevel(level);
  return submitForm(form, authUrl, {
    [`${permKey}_guests`]: guest ? "on" : null,
    [`${permKey}_members`]: member ? "on" : null,
  });
}

export async function pushAuthState(authUrl, { guests, members }) {
  const form = await loadForm(authUrl);
  const overrides = {};
  for (const p of PERMISSIONS) {
    overrides[`${p.key}_guests`] = guests[p.key] ? "on" : null;
    overrides[`${p.key}_members`] = members[p.key] ? "on" : null;
  }
  return submitForm(form, authUrl, overrides);
}

// Lien "Ajouter" natif
export async function createEntity(createUrl, { name, type }) {
  const form = await loadForm(createUrl);
  const overrides = { name };
  if (type != null) overrides.type = type;
  return submitForm(form, createUrl, overrides);
}

// Resoumission requise
export async function deleteEntity(deleteUrl) {
  const form = await loadForm(deleteUrl);
  return submitForm(form, deleteUrl, {}, "Supprimer");
}

export async function applyAudiencePreset(authUrl, presetKey) {
  const preset = AUDIENCE_PRESETS[presetKey];
  const state = await fetchAuthState(authUrl);
  Object.assign(state.guests, preset.guests);
  Object.assign(state.members, preset.members);
  await pushAuthState(authUrl, state);
  return state;
}

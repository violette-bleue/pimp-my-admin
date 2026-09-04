export async function fetchLiveContent(editUrl) {
  const res = await fetch(editUrl, { credentials: "include" });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ta = doc.getElementById("text_editor_textarea");
  if (!ta) throw new Error("page introuvable");
  return ta.value;
}

// Création en 2 temps
export async function createEntity(triggerForm, { name, content }) {
  const triggerRes = await fetch(new URL(triggerForm.getAttribute("action"), location.href).href, {
    method: "POST",
    credentials: "include",
    body: new FormData(triggerForm),
  });
  const triggerHtml = await triggerRes.text();
  const doc = new DOMParser().parseFromString(triggerHtml, "text/html");
  const form = doc.querySelector('form[name="formenvoi"]');
  if (!form) throw new Error("formulaire de création introuvable");

  const data = new FormData(form);
  data.set("title", name);
  data.set("html", content);
  data.set("submit", "Valider");

  const action = new URL(form.getAttribute("action"), triggerRes.url).href;
  const res = await fetch(action, { method: "POST", credentials: "include", body: data });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

export async function pushContent(editUrl, newContent) {
  const res = await fetch(editUrl, { credentials: "include" });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const form = doc.querySelector('form[name="formenvoi"]');
  if (!form) throw new Error("formulaire introuvable");

  const data = new FormData(form);
  data.set("html", newContent);
  data.set("submit", "Valider");

  const action = new URL(form.getAttribute("action"), editUrl).href;
  const postRes = await fetch(action, { method: "POST", credentials: "include", body: data });
  if (!postRes.ok) throw new Error("HTTP " + postRes.status);
  return postRes.text();
}

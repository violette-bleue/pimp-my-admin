import { extractTemplateRows } from "../shared/categories.js";

export async function fetchLiveContent(editUrl) {
  const res = await fetch(editUrl, { credentials: "include" });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ta = doc.getElementById("template");
  if (!ta) throw new Error("textarea introuvable");
  return ta.value;
}

export async function pushContent(editUrl, newContent) {
  const res = await fetch(editUrl, { credentials: "include" });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const form = doc.querySelector('form[name="post"]');
  if (!form) throw new Error("formulaire introuvable");

  const data = new FormData(form);
  data.set("template", newContent);
  data.set("submit", "Enregistrer");

  const action = new URL(form.getAttribute("action"), editUrl).href;
  const postRes = await fetch(action, { method: "POST", credentials: "include", body: data });
  if (!postRes.ok) throw new Error("HTTP " + postRes.status);
  return postRes.text();
}

export async function publishTemplate(publishUrl) {
  const res = await fetch(publishUrl, { credentials: "include" });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

export function derivePendingAfterUpdate(entry, savedHtml, baseUrl) {
  if (savedHtml) {
    const doc = new DOMParser().parseFromString(savedHtml, "text/html");
    const row = extractTemplateRows(doc, baseUrl).find((r) => r.tplName === entry.tplName);
    if (row) {
      entry.isPending = row.isPending;
      entry.publishUrl = row.publishUrl;
      return;
    }
  }
  entry.isPending = true;
}

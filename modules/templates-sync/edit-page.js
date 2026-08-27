import { setIconContent } from "../shared/dom.js";
import { normalize } from "../shared/util.js";
import { resolveLocalFile } from "../source/source.js";

export async function runEditPage(panel, index, tplName, textarea, category) {
  const body = panel.querySelector("#pma-body");
  setStatus(`Recherche de "${tplName}"…`, "loading", "icons8-rocket-32");

  const fileHandle = resolveLocalFile(index, tplName, category);
  if (!fileHandle) {
    setStatus(`Aucun fichier local nommé "${tplName}.html" trouvé.`, "missing", "icons8-poison-32");
    return;
  }

  const localContent = await fileHandle.text();
  const liveContent = textarea.value;

  if (normalize(localContent) === normalize(liveContent)) {
    setStatus(`"${tplName}" — à jour`, "same", "icons8-check-32");
    return;
  }

  setStatus(`"${tplName}" — différent`, "diff", "icons8-error-32");

  const actions = document.createElement("div");
  actions.id = "pma-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = "Afficher le contenu local";
  toggleBtn.type = "button";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copier";
  copyBtn.type = "button";
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(localContent);
    copyBtn.textContent = "Copié !";
    setTimeout(() => (copyBtn.textContent = "Copier"), 1500);
  });

  actions.append(toggleBtn, copyBtn);
  body.appendChild(actions);

  const pre = document.createElement("pre");
  pre.id = "pma-content";
  pre.textContent = localContent;
  pre.hidden = true;
  body.appendChild(pre);

  toggleBtn.addEventListener("click", () => {
    pre.hidden = !pre.hidden;
    toggleBtn.textContent = pre.hidden ? "Afficher le contenu local" : "Masquer";
  });

  function setStatus(text, kind, iconName) {
    let badge = panel.querySelector("#pma-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "pma-badge";
      body.appendChild(badge);
    }
    badge.className = "pma-badge pma-badge--" + kind;
    setIconContent(badge, iconName, text);
  }
}

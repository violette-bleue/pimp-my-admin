import { setIconContent, setProgress, setProgressState } from "./dom.js";
import { sleep } from "./util.js";

export function mountCreateMissing(container, { index, rows, network, createTrigger, itemNoun = "élément" }) {
  const existing = new Set(rows.map((r) => r.name));
  const missing = [...(index.byName ? index.byName.keys() : [])].filter((name) => !existing.has(name));
  if (!missing.length) return null;

  const wrapper = document.createElement("div");
  wrapper.id = "pma-create-missing";

  const head = document.createElement("div");
  head.className = "pma-icon-label";
  setIconContent(head, "icons8-rocket-32", `${missing.length} ${itemNoun}(s) local(aux) sans équivalent FA`);
  wrapper.appendChild(head);

  if (!createTrigger) {
    const note = document.createElement("div");
    note.textContent = "Lien de création introuvable sur cette page — impossible de créer depuis ici.";
    wrapper.appendChild(note);
    container.appendChild(wrapper);
    return wrapper;
  }

  const list = document.createElement("ul");
  list.id = "pma-create-missing-list";
  wrapper.appendChild(list);

  const createAllBtn = document.createElement("button");
  createAllBtn.type = "button";
  setIconContent(createAllBtn, "icons8-check-32", `Tout créer (${missing.length})`);
  wrapper.appendChild(createAllBtn);

  const progress = document.createElement("div");
  progress.className = "pma-scan-progress";
  progress.hidden = true;
  wrapper.appendChild(progress);

  const buttonByName = new Map();
  for (const name of missing) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = name;
    const btn = document.createElement("button");
    btn.type = "button";
    setIconContent(btn, "icons8-plus-32", "");
    btn.addEventListener("click", async () => {
      if (await createOne(name, btn)) setTimeout(() => location.reload(), 900);
    });
    li.append(label, btn);
    list.appendChild(li);
    buttonByName.set(name, btn);
  }

  async function createOne(name, btn) {
    if (btn) btn.disabled = true;
    try {
      const candidates = index.byName.get(name) || [];
      const fileLike = candidates[0] && candidates[0].file;
      if (!fileLike) throw new Error("fichier local introuvable");
      const content = await fileLike.text();
      await network.createEntity(createTrigger, { name, content });
      if (btn) setIconContent(btn, "icons8-check-32", "créé — rechargement…");
      return true;
    } catch (err) {
      console.error("échec création ):", name, err);
      if (btn) setIconContent(btn, "icons8-close-window-32", "échec");
      return false;
    }
  }

  createAllBtn.addEventListener("click", async () => {
    const ok = confirm(`Créer ${missing.length} ${itemNoun}(s) à partir du dossier source ?`);
    if (!ok) return;
    createAllBtn.disabled = true;
    progress.hidden = false;
    setProgressState(progress, "running");
    let done = 0;
    let failed = 0;
    for (let i = 0; i < missing.length; i++) {
      const name = missing[i];
      setProgress(progress, `Création "${name}" (${i + 1}/${missing.length})…`);
      if (await createOne(name, buttonByName.get(name))) done++;
      else failed++;
      await sleep(300);
    }
    setProgressState(progress, failed ? "error" : "done");
    progress.textContent = `${done} créé(s), ${failed} échec(s)` + (failed ? "." : " — rechargement…");
    if (!failed) setTimeout(() => location.reload(), 900);
  });

  container.appendChild(wrapper);
  return wrapper;
}

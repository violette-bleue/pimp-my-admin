import { setIconContent } from "./dom.js";

export function buildPanel() {
  const el = document.createElement("div");
  el.id = "pma-panel";
  el.innerHTML = `
    <div id="pma-header">
      <img src="https://violette-bleue.github.io/pimp-my-forum/img/logo.png" alt="" id="pma-logo" />
      <div id="pma-header-text">
        <div id="pma-title">Pimp my Admin <span id="pma-version"></span></div>
        <a href="https://pimpmyforum.forumactif.com/" target="_blank" id="pma-vitrine-link">
          <img src="https://violette-bleue.github.io/pimp-my-forum/img/icons/icons8-fire-32.png" alt="" class="pma-icon" />
          Pimp My Forum
        </a>
      </div>
      <button type="button" id="pma-update-check" title="Vérifier les mises à jour">⟳</button>
      <div id="pma-header-source" hidden></div>
      <button type="button" id="pma-native-toggle"></button>
    </div>
    <div id="pma-body"></div>
  `;
  el.querySelector("#pma-version").textContent = "v" + chrome.runtime.getManifest().version;
  wireUpdateCheck(el);
  mountUpdateBanner(el);
  wireNativeToggle(el);
  return el;
}

function wireNativeToggle(panel) {
  const btn = panel.querySelector("#pma-native-toggle");
  const body = panel.querySelector("#pma-body");
  const listeners = new Set();
  let active = true;

  function render() {
    setIconContent(btn, active ? "icons8-on-32" : "icons8-toggle-off-32", active ? "Extension activée" : "FA normal");
    body.hidden = !active;
    for (const fn of listeners) fn(active);
  }

  btn.addEventListener("click", () => {
    active = !active;
    render();
  });

  panel.pmaNativeToggle = {
    onToggle(fn) {
      listeners.add(fn);
      fn(active);
    },
  };

  render();
}

function wireUpdateCheck(panel) {
  const btn = panel.querySelector("#pma-update-check");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: "pma-check-update" }, () => {
      btn.disabled = false;
    });
  });
}

function mountUpdateBanner(panel) {
  function render(info) {
    if (panel.querySelector("#pma-update-banner")) return;

    const bar = document.createElement("div");
    bar.id = "pma-update-banner";

    const head = document.createElement("div");
    head.className = "pma-update-head";
    setIconContent(head, "icons8-rocket-32", `Mise à jour dispo — v${info.version}`);
    
    const releasesLink = document.createElement("a");
    releasesLink.href = info.releasesUrl;
    releasesLink.target = "_blank";
    releasesLink.textContent = "Télécharge la dernière version";

    const hint = document.createElement("div");
    hint.className = "pma-update-hint";
    hint.innerHTML = " ou <code>git pull</code> dans le dossier de l'extension";
    hint.prepend(releasesLink);

    bar.append(head, hint);

    if (info.entries && info.entries.length) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Nouveautés";
      details.appendChild(summary);

      for (const entry of info.entries) {
        const block = document.createElement("div");
        block.className = "pma-update-entry";

        const title = document.createElement("strong");
        title.textContent = `v${entry.version}${entry.date ? " · " + entry.date : ""}`;
        block.appendChild(title);

        const list = document.createElement("ul");
        for (const note of entry.notes || []) {
          const li = document.createElement("li");
          li.textContent = note;
          list.appendChild(li);
        }
        block.appendChild(list);
        details.appendChild(block);
      }
      bar.appendChild(details);
    }

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "pma-update-dismiss";
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => {
      chrome.storage.local.set({ pma_update_dismissed: info.version });
      bar.remove();
    });
    bar.appendChild(dismiss);

    panel.insertBefore(bar, panel.querySelector("#pma-body"));
  }

  async function refresh() {
    const { pma_update_info: info, pma_update_dismissed: dismissed } = await chrome.storage.local.get([
      "pma_update_info",
      "pma_update_dismissed",
    ]);
    if (info && info.version !== dismissed) render(info);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.pma_update_info) refresh();
  });

  refresh();
}

export function setHeaderSource(panel, source) {
  const el = panel.querySelector("#pma-header-source");
  if (!el) return;
  el.hidden = false;
  if (source.type === "local") {
    setIconContent(el, "icons8-folder-32", source.handle.name);
  } else {
    setIconContent(el, "icons8-github-32", source.theme);
  }
}

export function buildFolderErrorMessage(container, onRelink) {
  const msg = document.createElement("div");
  msg.id = "pma-folder-error";
  setIconContent(msg, "icons8-close-window-32", "Dossier source introuvable (déplacé, renommé ou supprimé ?)");
  const relinkBtn = document.createElement("button");
  relinkBtn.type = "button";
  relinkBtn.textContent = "Relier un dossier";
  relinkBtn.addEventListener("click", onRelink);
  container.append(msg, relinkBtn);
}

export function showSourceInfo(container, source, onChangeSource) {
  const row = document.createElement("div");
  row.id = "pma-folder";

  const label = document.createElement("span");
  label.className = "pma-icon-label";
  if (source.type === "local") {
    setIconContent(label, "icons8-folder-32", source.handle.name);
  } else {
    setIconContent(label, "icons8-github-32", source.theme);
  }

  const changeBtn = document.createElement("button");
  changeBtn.textContent = "Changer";
  changeBtn.type = "button";
  changeBtn.addEventListener("click", () => onChangeSource());

  row.append(label, changeBtn);
  container.appendChild(row);
}

export function buildSourcePickers(container, resolve, { persistLocalSource, discoverThemes, defaultOwner, defaultRepo, persistGithubSource }) {
  const localBtn = document.createElement("button");
  localBtn.type = "button";
  setIconContent(localBtn, "icons8-folder-32", "Choisir un dossier local");
  localBtn.addEventListener("click", async () => {
    try {
      const handle = await window.showDirectoryPicker();
      const source = { type: "local", handle };
      await persistLocalSource(source);
      resolve(source);
    } catch (err) {
    }
  });

  const githubBtn = document.createElement("button");
  githubBtn.type = "button";
  setIconContent(githubBtn, "icons8-github-32", "Utiliser un thème GitHub");
  githubBtn.addEventListener("click", () => {
    localBtn.remove();
    githubBtn.remove();
    buildGithubSetupForm(container, resolve, { discoverThemes, defaultOwner, defaultRepo, persistGithubSource });
  });

  container.append(localBtn, githubBtn);
}

export function buildGithubSetupForm(container, resolve, { discoverThemes, defaultOwner, defaultRepo, persistGithubSource }) {
  const wrap = document.createElement("div");
  wrap.id = "pma-github-setup";

  const header = document.createElement("div");
  header.id = "pma-github-header";

  const title = document.createElement("span");
  title.id = "pma-github-title";
  title.textContent = "PMF Library";

  const advancedToggle = document.createElement("button");
  advancedToggle.type = "button";
  setIconContent(advancedToggle, "icons8-gear-32", "");
  advancedToggle.title = "Mode avancé";

  header.append(title, advancedToggle);
  wrap.appendChild(header);

  const advancedPanel = document.createElement("div");
  advancedPanel.id = "pma-github-advanced";
  advancedPanel.hidden = true;

  const ownerInput = document.createElement("input");
  ownerInput.placeholder = "owner";
  ownerInput.value = defaultOwner;

  const repoInput = document.createElement("input");
  repoInput.placeholder = "repo";
  repoInput.value = defaultRepo;

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.textContent = "Charger les thèmes";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "Réinitialiser";
  resetBtn.addEventListener("click", () => {
    ownerInput.value = defaultOwner;
    repoInput.value = defaultRepo;
    loadThemes();
  });

  advancedPanel.append(ownerInput, repoInput, loadBtn, resetBtn);
  wrap.appendChild(advancedPanel);

  advancedToggle.addEventListener("click", () => {
    advancedPanel.hidden = !advancedPanel.hidden;
  });

  const status = document.createElement("div");
  status.className = "pma-github-status";
  wrap.appendChild(status);

  const themeList = document.createElement("div");
  themeList.id = "pma-github-themes";
  wrap.appendChild(themeList);

  container.appendChild(wrap);

  async function loadThemes() {
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    if (!owner || !repo) return;

    themeList.innerHTML = "";
    status.textContent = "Chargement…";
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (!repoRes.ok) throw new Error("repo introuvable ou privé");
      const branch = (await repoRes.json()).default_branch;

      const themes = await discoverThemes(owner, repo, branch);
      if (!themes.length) {
        status.textContent = "Aucun dossier de thème trouvé à la racine de ce repo.";
        return;
      }

      status.textContent = "";
      themes.forEach((theme) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = theme;
        btn.addEventListener("click", async () => {
          const source = { type: "github", owner, repo, branch, theme };
          await persistGithubSource(source);
          resolve(source);
        });
        themeList.appendChild(btn);
      });
    } catch (err) {
      status.textContent = "Erreur : " + err.message;
    }
  }

  loadBtn.addEventListener("click", loadThemes);
  loadThemes();
}

export function buildReauthorizeButton(container, handle, onGranted) {
  const btn = document.createElement("button");
  setIconContent(btn, "icons8-lock-32", "Réautoriser l'accès au dossier");
  btn.type = "button";
  btn.addEventListener("click", async () => {
    try {
      const perm = await handle.requestPermission({ mode: "read" });
      if (perm === "granted") {
        btn.remove();
        onGranted();
      }
    } catch (err) {
      console.error("Echec de la demande de permission ):", err);
      setIconContent(btn, "icons8-close-window-32", "Erreur — le dossier a peut-être été déplacé ou supprimé ?");
    }
  });
  container.appendChild(btn);
}

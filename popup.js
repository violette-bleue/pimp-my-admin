const INFO_KEY = "pma_update_info";
const DISMISSED_KEY = "pma_update_dismissed";

const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");
const notesEl = document.getElementById("notes");
const checkBtn = document.getElementById("check");
const dismissBtn = document.getElementById("dismiss");

const localVersion = chrome.runtime.getManifest().version;

function renderNotes(entries) {
  notesEl.innerHTML = "";
  for (const entry of entries || []) {
    const block = document.createElement("div");
    block.className = "entry";

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
    notesEl.appendChild(block);
  }
}

function render(info) {
  if (info && info.version) {
    statusEl.className = "update";
    statusEl.textContent = `v${info.version} disponible`;
    hintEl.hidden = false;
    dismissBtn.hidden = false;
    renderNotes(info.entries);
  } else {
    statusEl.className = "ok";
    statusEl.textContent = `À jour — v${localVersion}`;
    hintEl.hidden = true;
    dismissBtn.hidden = true;
    notesEl.innerHTML = "";
  }
}

async function load() {
  const { [INFO_KEY]: info, [DISMISSED_KEY]: dismissed } = await chrome.storage.local.get([INFO_KEY, DISMISSED_KEY]);
  render(info && info.version !== dismissed ? info : null);
}

checkBtn.addEventListener("click", () => {
  checkBtn.disabled = true;
  checkBtn.textContent = "…";
  chrome.runtime.sendMessage({ type: "pma-check-update" }, () => {
    load();
    checkBtn.disabled = false;
    checkBtn.textContent = "Vérifier maintenant";
  });
});

dismissBtn.addEventListener("click", async () => {
  const { [INFO_KEY]: info } = await chrome.storage.local.get(INFO_KEY);
  if (info && info.version) {
    await chrome.storage.local.set({ [DISMISSED_KEY]: info.version });
  }
  load();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[INFO_KEY] || changes[DISMISSED_KEY])) load();
});

load();

const ENABLED_KEY = "pma_auto_reload";
const checkbox = document.getElementById("auto-reload");

chrome.storage.local.get(ENABLED_KEY).then(({ [ENABLED_KEY]: enabled = true }) => {
  checkbox.checked = enabled;
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.set({ [ENABLED_KEY]: checkbox.checked });
});

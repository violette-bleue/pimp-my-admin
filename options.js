const ENABLED_KEY = "pma_auto_reload";
const UPDATE_KEY = "pma_update_check";

const reloadBox = document.getElementById("auto-reload");
const updateBox = document.getElementById("update-check");
const checkNow = document.getElementById("check-now");

chrome.storage.local.get([ENABLED_KEY, UPDATE_KEY]).then((s) => {
  reloadBox.checked = s[ENABLED_KEY] ?? true;
  updateBox.checked = s[UPDATE_KEY] ?? true;
});

reloadBox.addEventListener("change", () => {
  chrome.storage.local.set({ [ENABLED_KEY]: reloadBox.checked });
});

updateBox.addEventListener("change", () => {
  chrome.storage.local.set({ [UPDATE_KEY]: updateBox.checked });
});

checkNow.addEventListener("click", () => {
  checkNow.disabled = true;
  chrome.runtime.sendMessage({ type: "pma-check-update" }, () => {
    checkNow.textContent = "Vérifié";
    setTimeout(() => {
      checkNow.textContent = "Vérifier maintenant";
      checkNow.disabled = false;
    }, 1500);
  });
});

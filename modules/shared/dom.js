export function iconUrl(name) {
  return `https://violette-bleue.github.io/pimp-my-forum/img/icons/${name}.png`;
}

export function setIconContent(el, iconName, label) {
  el.innerHTML = "";
  const img = document.createElement("img");
  img.src = iconUrl(iconName);
  img.alt = "";
  img.className = "pma-icon" + (iconName === "icons8-rocket-32" ? " pma-icon--rocket" : "");
  el.append(img, document.createTextNode(label));
}

export function setProgress(el, label) {
  setIconContent(el, "icons8-rocket-32", label);
}

const PROGRESS_STATES = ["running", "done", "error"];

export function setProgressState(el, state) {
  for (const s of PROGRESS_STATES) el.classList.toggle(`pma-scan-progress--${s}`, s === state);
}

export function setPanelBusy(el, busy) {
  el.closest("#pma-panel")?.classList.toggle("pma-locked", busy);
}

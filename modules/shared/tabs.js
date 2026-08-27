export function buildTabs(tabDefs) {
  const root = document.createElement("div");
  root.className = "pma-tabs";
  const nav = document.createElement("div");
  nav.className = "pma-tabs-nav";
  root.appendChild(nav);

  const panels = new Map();
  const buttons = new Map();
  const listeners = new Map();
  let activeId = null;

  for (const { id, label } of tabDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pma-tab-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => setActive(id));
    nav.appendChild(btn);
    buttons.set(id, btn);

    const panelEl = document.createElement("div");
    panelEl.className = "pma-tab-panel";
    panelEl.hidden = true;
    root.appendChild(panelEl);
    panels.set(id, panelEl);
  }

  function setActive(id) {
    if (!panels.has(id) || activeId === id) return;
    activeId = id;
    for (const [tid, btn] of buttons) btn.classList.toggle("pma-tab-btn--active", tid === id);
    for (const [tid, panelEl] of panels) panelEl.hidden = tid !== id;
    for (const fn of listeners.get(id) || []) fn();
  }

  function onShow(id, fn, { once = false } = {}) {
    if (!listeners.has(id)) listeners.set(id, new Set());
    const set = listeners.get(id);
    const wrapped = once
      ? () => {
          set.delete(wrapped);
          fn();
        }
      : fn;
    set.add(wrapped);
    if (activeId === id) wrapped();
    return () => set.delete(wrapped);
  }

  return { root, nav, panels, buttons, setActive, onShow, getActive: () => activeId };
}

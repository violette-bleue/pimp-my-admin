import { setIconContent, setProgressState, setProgress } from "../shared/dom.js";
import { sleep } from "../shared/util.js";
import { PERMISSIONS, AUDIENCE_PRESETS } from "./schema.js";
import { pushAuthState, applyAudiencePreset, StaleFormError } from "./network.js";

function buildGrid(container, initialState) {
  const table = document.createElement("table");
  table.className = "pma-perm-grid";

  const head = document.createElement("tr");
  head.innerHTML = "<th></th><th>Invités</th><th>Membres</th>";
  table.appendChild(head);

  const checkboxes = {};
  for (const p of PERMISSIONS) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = p.label;
    tr.appendChild(label);

    const guestCb = document.createElement("input");
    guestCb.type = "checkbox";
    guestCb.checked = !!initialState.guests[p.key];
    const guestTd = document.createElement("td");
    guestTd.appendChild(guestCb);
    tr.appendChild(guestTd);

    const memberCb = document.createElement("input");
    memberCb.type = "checkbox";
    memberCb.checked = !!initialState.members[p.key];
    const memberTd = document.createElement("td");
    memberTd.appendChild(memberCb);
    tr.appendChild(memberTd);

    checkboxes[p.key] = { guest: guestCb, member: memberCb };
    table.appendChild(tr);
  }

  container.appendChild(table);

  return {
    read() {
      const guests = {};
      const members = {};
      for (const p of PERMISSIONS) {
        guests[p.key] = checkboxes[p.key].guest.checked;
        members[p.key] = checkboxes[p.key].member.checked;
      }
      return { guests, members };
    },
    applyPreset(presetKey) {
      const preset = AUDIENCE_PRESETS[presetKey];
      for (const [key, val] of Object.entries(preset.guests)) checkboxes[key].guest.checked = val;
      for (const [key, val] of Object.entries(preset.members)) checkboxes[key].member.checked = val;
    },
  };
}

function buildPresetRow() {
  const row = document.createElement("div");
  row.className = "pma-actions";
  const buttons = {};
  for (const [key, preset] of Object.entries(AUDIENCE_PRESETS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    setIconContent(btn, "icons8-lipstick-32", preset.label);
    row.appendChild(btn);
    buttons[key] = btn;
  }
  return { row, buttons };
}

// Barre d'outils groupée
export function mountBulkPermissionsToolbar(container, getSelectedEntities) {
  const wrapper = document.createElement("div");
  wrapper.id = "pma-bulk-perms";

  const { row: presetRow, buttons } = buildPresetRow();
  wrapper.appendChild(presetRow);

  const customBtn = document.createElement("button");
  customBtn.type = "button";
  setIconContent(customBtn, "icons8-gear-32", "Personnalisé…");
  wrapper.appendChild(customBtn);

  const progress = document.createElement("div");
  progress.className = "pma-scan-progress";
  progress.hidden = true;
  wrapper.appendChild(progress);

  const customGridHost = document.createElement("div");
  customGridHost.hidden = true;
  wrapper.appendChild(customGridHost);

  container.appendChild(wrapper);

  async function applyToSelection(apply, label) {
    const targets = getSelectedEntities().filter((e) => e.authUrl);
    if (!targets.length) {
      alert("Coche au moins un forum (les catégories n'ont pas de permissions).");
      return;
    }
    const ok = confirm(`Appliquer "${label}" à ${targets.length} forum(s) ?`);
    if (!ok) return;

    progress.hidden = false;
    setProgressState(progress, "running");
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const entity = targets[i];
      setProgress(progress, `${label} → "${entity.name}" (${i + 1}/${targets.length})…`);
      try {
        await apply(entity);
      } catch (err) {
        if (err instanceof StaleFormError) {
          setProgressState(progress, "error");
          progress.textContent = "Page périmée — recharge la page et réessaie.";
          return;
        }
        failed++;
        console.error("échec application groupée ):", entity.name, err);
      }
      await sleep(300);
    }
    setProgressState(progress, failed ? "error" : "done");
    progress.textContent = failed
      ? `${targets.length - failed}/${targets.length} forum(s) mis à jour, ${failed} échec(s).`
      : `${targets.length} forum(s) mis à jour.`;
  }

  for (const [key, btn] of Object.entries(buttons)) {
    btn.addEventListener("click", () =>
      applyToSelection((entity) => applyAudiencePreset(entity.authUrl, key), AUDIENCE_PRESETS[key].label)
    );
  }

  customBtn.addEventListener("click", () => {
    customGridHost.hidden = !customGridHost.hidden;
    if (customGridHost.hidden || customGridHost.childElementCount) return;

    const blank = { guests: {}, members: {} };
    for (const p of PERMISSIONS) {
      blank.guests[p.key] = false;
      blank.members[p.key] = false;
    }
    const grid = buildGrid(customGridHost, blank);

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    setIconContent(applyBtn, "icons8-check-32", "Appliquer à la sélection");
    customGridHost.appendChild(applyBtn);

    applyBtn.addEventListener("click", () => {
      const state = grid.read();
      applyToSelection((entity) => pushAuthState(entity.authUrl, state), "Personnalisé");
    });
  });
}

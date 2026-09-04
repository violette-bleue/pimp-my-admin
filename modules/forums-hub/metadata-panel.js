import { setIconContent, setProgressState } from "../shared/dom.js";
import { fetchMetadata, pushMetadata, refetchPositionOptions, StaleFormError } from "./network.js";

function buildSelect(name, options, value) {
  const select = document.createElement("select");
  select.name = name;
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    if (opt.value === value) el.selected = true;
    select.appendChild(el);
  }
  return select;
}

export function mountMetadataPanel(container, entity) {
  container.innerHTML = "";
  const status = document.createElement("div");
  status.className = "pma-scan-progress";
  setProgressState(status, "running");
  status.textContent = "Chargement…";
  container.appendChild(status);

  fetchMetadata(entity.editUrl).then(
    (meta) => {
      status.remove();
      renderForm(meta);
    },
    (err) => {
      console.error("échec chargement métadonnées ):", entity.name, err);
      setProgressState(status, "error");
      status.textContent = err instanceof StaleFormError ? err.message : "Échec du chargement.";
    }
  );

  function renderForm(meta) {
    const form = document.createElement("div");
    form.className = "pma-forum-form";

    const nameRow = labeledRow("Nom", makeText("name", meta.name));
    form.appendChild(nameRow);

    const mainSelect = buildSelect("main", meta.mainOptions, meta.main);
    form.appendChild(labeledRow("Catégorie / parent", mainSelect));

    let positionOptions = meta.positionOptions;
    const positionSelect = buildSelect("position", positionOptions, meta.position);
    form.appendChild(labeledRow("Position", positionSelect));

    mainSelect.addEventListener("change", async () => {
      positionSelect.disabled = true;
      try {
        positionOptions = await refetchPositionOptions(entity.editUrl, mainSelect.value);
        positionSelect.innerHTML = "";
        for (const opt of positionOptions) {
          const el = document.createElement("option");
          el.value = opt.value;
          el.textContent = opt.label;
          positionSelect.appendChild(el);
        }
      } catch (err) {
        console.error("échec rafraîchissement position ):", err);
      } finally {
        positionSelect.disabled = false;
      }
    });

    if (meta.status != null) {
      form.appendChild(labeledRow("Statut", buildSelect("status", meta.statusOptions, meta.status)));
    }
    if (meta.orderTopics != null) {
      form.appendChild(labeledRow("Tri des sujets", buildSelect("order_topics", meta.orderTopicsOptions, meta.orderTopics)));
    }
    if (meta.orderPosts != null) {
      form.appendChild(labeledRow("Tri des messages", buildSelect("order_posts", meta.orderPostsOptions, meta.orderPosts)));
    }
    if (meta.image != null) {
      form.appendChild(makeImageRow("image", meta.image));
    }

    const descArea = document.createElement("textarea");
    descArea.name = "desc";
    descArea.value = meta.desc;
    form.appendChild(labeledRow("Description", descArea));

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    setIconContent(saveBtn, "icons8-check-32", "Enregistrer");
    form.appendChild(saveBtn);

    const feedback = document.createElement("span");
    form.appendChild(feedback);

    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      feedback.textContent = "";
      try {
        await pushMetadata(entity.editUrl, {
          name: form.querySelector('[name="name"]').value,
          main: mainSelect.value,
          position: positionSelect.value,
          status: form.querySelector('[name="status"]')?.value ?? null,
          orderTopics: form.querySelector('[name="order_topics"]')?.value ?? null,
          orderPosts: form.querySelector('[name="order_posts"]')?.value ?? null,
          image: form.querySelector('[name="image"]')?.value ?? null,
          desc: descArea.value,
        });
        feedback.textContent = "Enregistré ✅ — recharge la page pour voir l'arbre à jour.";
      } catch (err) {
        console.error("échec enregistrement métadonnées ):", entity.name, err);
        feedback.textContent = err instanceof StaleFormError ? err.message : "Échec de l'enregistrement ):";
      } finally {
        saveBtn.disabled = false;
      }
    });

    container.appendChild(form);
  }
}

function makeText(name, value) {
  const input = document.createElement("input");
  input.type = "text";
  input.name = name;
  input.value = value;
  return input;
}

function makeImageRow(name, value) {
  const row = labeledRow("Image", makeText(name, value));
  const input = row.querySelector(`[name="${name}"]`);

  const preview = document.createElement("img");
  preview.className = "pma-forum-image-preview";
  preview.hidden = true;
  row.appendChild(preview);

  preview.addEventListener("error", () => {
    preview.hidden = true;
  });
  input.addEventListener("input", () => {
    preview.hidden = !input.value;
    preview.src = input.value;
  });
  if (input.value) {
    preview.hidden = false;
    preview.src = input.value;
  }

  return row;
}

function labeledRow(label, field) {
  const row = document.createElement("label");
  row.className = "pma-forum-form-row";
  const span = document.createElement("span");
  span.textContent = label;
  row.append(span, field);
  return row;
}

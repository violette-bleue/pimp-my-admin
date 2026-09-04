import { idbGet, idbSet } from "../shared/idb.js";
import { buildSourcePickers, buildReauthorizeButton } from "../shared/panel.js";
import { extractCategoryLinks, slugifyCategory } from "../shared/categories.js";
import { readOriginalName, stripNameMarker } from "../shared/safe-name.js";

export const DEFAULT_GITHUB_SOURCE = { owner: "violette-bleue", repo: "pimp-my-forum-library" };

// Structure ≥0.1.1
const RESERVED_ROOT_FOLDERS = new Set(["templates", "html", "js", "forums"]);

export function forgetSource() {
  return idbSet("source", null);
}

export async function loadSource(container) {
  const saved = await idbGet("source");

  if (!saved) {
    return new Promise((resolve) => {
      buildSourcePickers(container, resolve, {
        persistLocalSource: (source) => idbSet("source", source),
        discoverThemes,
        defaultOwner: DEFAULT_GITHUB_SOURCE.owner,
        defaultRepo: DEFAULT_GITHUB_SOURCE.repo,
        persistGithubSource: (source) => idbSet("source", source),
      });
    });
  }

  if (saved.type === "github") return saved;

  const already = await saved.handle.queryPermission({ mode: "read" });
  if (already === "granted") return saved;

  return new Promise((resolve) => {
    buildReauthorizeButton(container, saved.handle, () => resolve(saved));
  });
}

export async function buildFileIndex(source, moduleKey, { withCategories = false } = {}) {
  return source.type === "local"
    ? buildLocalIndex(source.handle, moduleKey, withCategories)
    : buildGithubIndex(source, moduleKey, withCategories);
}

async function buildLocalIndex(rootHandle, moduleKey, withCategories) {
  const index = new Map();
  const byName = new Map();
  const extension = moduleKey === "js" ? ".js" : ".html";

  function record(category, base, fileLike) {
    if (category) index.set(category + "/" + base, fileLike);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push({ category, file: fileLike });
  }

  function toFileLike(entry, hasMarker) {
    return {
      text: () =>
        entry
          .getFile()
          .then((f) => f.text())
          .then((t) => (hasMarker ? stripNameMarker(t) : t)),
      mtime: () => entry.getFile().then((f) => f.lastModified),
    };
  }

  let moduleHandle;
  let legacyRoot = false;
  try {
    moduleHandle = await rootHandle.getDirectoryHandle(moduleKey);
  } catch (err) {
    if (!withCategories) {
      index.byName = byName;
      return index; // dossier absent
    }
    moduleHandle = rootHandle; // repli : anciennes catégories à la racine
    legacyRoot = true;
  }

  try {
    if (withCategories) {
      async function walk(handle, category) {
        for await (const [name, entry] of handle.entries()) {
          if (legacyRoot && category === null && RESERVED_ROOT_FOLDERS.has(name)) continue;
          if (entry.kind === "directory") await walk(entry, category || name);
          else if (name.endsWith(extension) && category) {
            record(category, name.slice(0, -extension.length), toFileLike(entry, false));
          }
        }
      }
      await walk(moduleHandle, null);
    } else {
      for await (const [name, entry] of moduleHandle.entries()) {
        if (entry.kind === "file" && name.endsWith(extension)) {
          let base = name.slice(0, -extension.length);
          let hasMarker = false;
          try {
            const head = await (await entry.getFile()).slice(0, 512).text();
            const original = readOriginalName(head);
            if (original) {
              base = original;
              hasMarker = true;
            }
          } catch (err) {
            // intentionnel
          }
          record(null, base, toFileLike(entry, hasMarker));
        }
      }
    }
  } catch (err) {
    console.error("Echec de lecture du dossier ):", moduleKey, err);
  }

  index.byName = byName;
  return index;
}

async function buildGithubIndex(source, moduleKey, withCategories) {
  const { owner, repo, branch, theme } = source;
  const tree = await fetchGithubTree(owner, repo, branch);
  const prefix = `${theme}/${moduleKey}/`;
  const extension = moduleKey === "js" ? ".js" : ".html";
  const index = new Map();
  const byName = new Map();

  for (const item of tree) {
    if (item.type !== "blob" || !item.path.startsWith(prefix) || !item.path.endsWith(extension)) continue;
    const rest = item.path.slice(prefix.length, -extension.length);

    let category = null;
    let basename = rest;
    if (withCategories) {
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) continue;
      category = rest.slice(0, slashIdx);
      basename = rest.slice(slashIdx + 1);
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;

    let hasMarker = false;
    if (!withCategories) {
      try {
        const head = await fetch(rawUrl, { headers: { Range: "bytes=0-511" } }).then((r) => r.text());
        const original = readOriginalName(head);
        if (original) {
          basename = original;
          hasMarker = true;
        }
      } catch (err) {
        // intentionnel
      }
    }

    const fileLike = {
      text: () =>
        fetch(rawUrl)
          .then((r) => r.text())
          .then((t) => (hasMarker ? stripNameMarker(t) : t)),
      mtime: () => null,
    };
    if (category) index.set(category + "/" + basename, fileLike);
    if (!byName.has(basename)) byName.set(basename, []);
    byName.get(basename).push({ category, file: fileLike });
  }
  index.byName = byName;
  return index;
}

export function resolveLocalFile(index, tplName, category) {
  if (category) {
    const scoped = index.get(category + "/" + tplName);
    if (scoped) return scoped;
  }
  const candidates = (index.byName && index.byName.get(tplName)) || [];
  if (candidates.length === 1) return candidates[0].file;
  if (candidates.length > 1) {
    console.warn(
      `fallback si doublons : "${tplName}" / (${candidates.map((c) => c.category).join(", ")}) ` // FALLBACK PRUDENT
    );
  }
  return undefined;
}

export function resolveEditCategory(doc, baseUrl) {
  if (!document.referrer) return null;
  try {
    const refMode = new URL(document.referrer).searchParams.get("mode");
    if (!refMode) return null;
    const match = extractCategoryLinks(doc, baseUrl).find(
      (cat) => new URL(cat.url).searchParams.get("mode") === refMode
    );
    return match ? slugifyCategory(match.label) : null;
  } catch (err) {
    return null;
  }
}

async function fetchGithubTree(owner, repo, branch) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!res.ok) throw new Error("arbre du repo introuvable ):");
  const data = await res.json();
  return data.tree || [];
}

export async function discoverThemes(owner, repo, branch) {
  const tree = await fetchGithubTree(owner, repo, branch);
  return tree.filter((item) => item.type === "tree" && !item.path.includes("/")).map((item) => item.path);
}

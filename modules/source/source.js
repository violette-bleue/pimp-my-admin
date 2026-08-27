import { idbGet, idbSet } from "../shared/idb.js";
import { buildSourcePickers, buildReauthorizeButton } from "../shared/panel.js";
import { extractCategoryLinks, slugifyCategory } from "../shared/categories.js";

export const DEFAULT_GITHUB_SOURCE = { owner: "violette-bleue", repo: "pimp-my-forum-library" };

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

export async function buildFileIndex(source) {
  return source.type === "local" ? buildLocalIndex(source.handle) : buildGithubIndex(source);
}

async function buildLocalIndex(dirHandle) {
  const index = new Map();
  const byName = new Map();

  function record(category, base, fileLike) {
    index.set(category + "/" + base, fileLike);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push({ category, file: fileLike });
  }

  async function walk(handle, category) {
    try {
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind === "directory") {
          await walk(entry, category || name);
        } else if (name.endsWith(".html") && category) {
          record(category, name.slice(0, -5), {
            text: () => entry.getFile().then((f) => f.text()),
            mtime: () => entry.getFile().then((f) => f.lastModified),
          });
        }
      }
    } catch (err) {
      console.error("Echec de lecture du dossier ):", handle.name, err);
    }
  }
  await walk(dirHandle, null);
  index.byName = byName;
  return index;
}

async function buildGithubIndex(source) {
  const { owner, repo, branch, theme } = source;
  const tree = await fetchGithubTree(owner, repo, branch);
  const prefix = theme + "/";
  const index = new Map();
  const byName = new Map();

  for (const item of tree) {
    if (item.type !== "blob" || !item.path.startsWith(prefix) || !item.path.endsWith(".html")) continue;
    const rest = item.path.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    const category = rest.slice(0, slashIdx);
    const basename = rest.slice(slashIdx + 1, -5);
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
    const fileLike = { text: () => fetch(rawUrl).then((r) => r.text()), mtime: () => null };
    index.set(category + "/" + basename, fileLike);
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

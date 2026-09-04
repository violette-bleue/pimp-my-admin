const FORBIDDEN = new Set('<>:"/\\|?*'.split(""));
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MARKER_RE = /^(?:\/\/|<!--) nom d'origine : (.*?)(?: -->)?\r?\n/;

export function toSafeName(name) {
  let safe = "";
  for (const ch of name) {
    safe += FORBIDDEN.has(ch) || ch.charCodeAt(0) < 32 ? "_" : ch;
  }
  safe = safe.replace(/[ .]+$/, "").trim();
  if (!safe) safe = "sans-nom";
  if (RESERVED.test(safe)) safe = "_" + safe;
  return safe;
}

export function nameMarkerLine(originalName, moduleKey) {
  const clean = originalName.replace(/\s+/g, " ").trim();
  return moduleKey === "js" ? `// nom d'origine : ${clean}\n` : `<!-- nom d'origine : ${clean} -->\n`;
}

export function readOriginalName(content) {
  const m = content.match(MARKER_RE);
  return m ? m[1] : null;
}

export function stripNameMarker(content) {
  return content.replace(MARKER_RE, "");
}

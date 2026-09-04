const DELIMITER = ";";

function escapeCell(value) {
  const s = value == null ? "" : String(value);
  return /["\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows, columns) {
  const header = columns.map(escapeCell).join(DELIMITER);
  const lines = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(DELIMITER));
  return [header, ...lines].join("\r\n");
}

function parseLine(line, delimiter) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function detectDelimiter(headerLine) {
  return [",", ";", "\t"]
    .map((d) => ({ d, n: parseLine(headerLine, d).length }))
    .sort((a, b) => b.n - a.n)[0].d;
}

export function fromCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((l) => l.length);
  if (!lines.length) return { columns: [], rows: [] };

  const [headerLine, ...rest] = lines;
  const delimiter = detectDelimiter(headerLine);
  const columns = parseLine(headerLine, delimiter).map((c) => c.trim());
  while (columns.length && columns[columns.length - 1] === "") columns.pop();

  const rows = [];
  for (const line of rest) {
    const values = parseLine(line, delimiter);
    const row = {};
    columns.forEach((col, i) => (row[col] = (values[i] ?? "").trim()));
    if (Object.values(row).some((v) => v !== "")) rows.push(row);
  }
  return { columns, rows };
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

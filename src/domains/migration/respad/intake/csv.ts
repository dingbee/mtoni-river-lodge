/** Minimal RFC4180 CSV/TSV parser (quotes, escaped quotes, CRLF). */
export function parseDelimited(text: string, delimiter?: string) {
  const src = text.replace(/^\uFEFF/, "");
  const d = delimiter ?? sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === d) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c === "\r") {
      /* skip */
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return { delimiter: d, rows: rows.filter((r) => r.some((v) => v.trim() !== "")) };
}

export function sniffDelimiter(text: string) {
  const head = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const c of candidates) {
    const score = head.split(c).length - 1;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export type Table = { headers: string[]; rows: Record<string, unknown>[] };

/** Build a header-keyed table from a raw grid. Blank headers get positions. */
export function gridToTable(grid: string[][]): Table {
  if (!grid.length) return { headers: [], rows: [] };
  const headerRow = grid[0]!;
  const headers = headerRow.map((h, i) => (h ?? "").trim() || `column_${i + 1}`);
  const rows = grid.slice(1).map((r) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").toString().trim();
    });
    return obj;
  });
  return { headers, rows };
}
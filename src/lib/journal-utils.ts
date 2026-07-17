/** Client + server safe helpers for journal content. */

/** Very small HTML→text extractor for word-count / TOC scans. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

/** Compute estimated reading time in minutes at 220 wpm. */
export function computeReadMinutes(html: string | null | undefined): number {
  if (!html) return 1;
  const words = stripTags(html).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Extract H2 + H3 headings with stable slug ids from an HTML string. */
export function extractToc(html: string | null | undefined): TocEntry[] {
  if (!html) return [];
  const out: TocEntry[] = [];
  const seen = new Map<string, number>();
  const rx = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const level = Number(m[1]) as 2 | 3;
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const base = slugify(text) || `section-${out.length + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ id: n === 1 ? base : `${base}-${n}`, text, level });
  }
  return out;
}

/** Inject id attributes onto H2/H3 tags so a rendered TOC can link to them. */
export function injectHeadingIds(html: string | null | undefined): string {
  if (!html) return "";
  const seen = new Map<string, number>();
  return html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_full, lvl, attrs, inner) => {
    if (/\sid=/.test(attrs)) return `<h${lvl}${attrs}>${inner}</h${lvl}>`;
    const text = stripTags(inner).replace(/\s+/g, " ").trim();
    const base = slugify(text) || `section`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    return `<h${lvl}${attrs} id="${id}">${inner}</h${lvl}>`;
  });
}
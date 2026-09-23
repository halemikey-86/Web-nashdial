import { noteIndex, prefersFlats } from '../../music/notes';
import { scaleNotes } from '../../music/scales';
import { parseImport, type ParsedImport } from '../io';
import { normalizeKeyName } from '../songTranspose';
import type { Song } from '../types';
import { parseMusicXml } from './musicxml';
import { parseChordSheet } from './textSheet';

/** File types the song importer understands, for the file picker. */
export const SONG_FILE_ACCEPT = [
  `.json`,
  `.txt`,
  `.text`,
  `.crd`,
  `.chord`,
  `.chords`,
  `.cho`,
  `.chopro`,
  `.chordpro`,
  `.pro`,
  `.tab`,
  `.pdf`,
  `.musicxml`,
  `.xml`,
  `.mxl`,
].join(`,`);

const baseName = (name: string) => name.replace(/\.[^.]+$/, ``).replace(/[_-]+/g, ` `).trim();

/** Read a .mxl (compressed MusicXML): find the score inside the zip and inflate it. */
async function readMxl(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const entries: { name: string; method: number; data: Uint8Array }[] = [];
  let p = 0;
  while (p + 30 <= bytes.length && view.getUint32(p, true) === 0x04034b50) {
    const method = view.getUint16(p + 8, true);
    const size = view.getUint32(p + 18, true);
    const nameLen = view.getUint16(p + 26, true);
    const extraLen = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extraLen;
    entries.push({ name, method, data: bytes.subarray(start, start + size) });
    p = start + size;
  }
  const inflate = async (e: { method: number; data: Uint8Array }) => {
    if (e.method === 0) return new TextDecoder().decode(e.data);
    const stream = new Blob([e.data.slice()]).stream().pipeThrough(new DecompressionStream(`deflate-raw`));
    return new Response(stream).text();
  };
  const container = entries.find((e) => e.name === `META-INF/container.xml`);
  let scorePath: string | null = null;
  if (container) scorePath = /full-path="([^"]+)"/.exec(await inflate(container))?.[1] ?? null;
  const score = entries.find((e) => e.name === scorePath) ?? entries.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !e.name.startsWith(`META-INF`));
  if (!score) throw new Error(`No score found inside that .mxl file.`);
  return inflate(score);
}

interface PdfItem {
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
}

/** Group text items into lines, allowing a little vertical wobble (superscripts, mixed fonts). */
function toLines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; h: number; items: PdfItem[] }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, Math.max(l.h, it.h) * 0.35));
    if (line) {
      line.items.push(it);
      line.h = Math.max(line.h, it.h);
    } else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => l.items.sort((a, b) => a.x - b.x));
}

const CHORDISH = /^[A-G][#b♯♭]?[^\s]*$/;
const CHORD_SUFFIX = /^(?:m(?:aj)?|min|sus|add|dim|aug|\+|°|ø|\d|\(|\)|#|b|♯|♭|\/[A-G])[^\s]*$/;

/**
 * Chart PDFs set chord extensions as raised, smaller text (the "7" in Dm7) and often draw ♭/♯ as a
 * shape rather than a character, leaving only a gap. Join the pieces back into one chord and put the
 * missing accidental back where the gap says it was.
 */
function mergeChordParts(line: PdfItem[], acc: string): { items: PdfItem[]; restored: number } {
  const out: PdfItem[] = [];
  let restored = 0;
  for (const raw of line) {
    if (!raw.str.trim()) continue;
    const it = { ...raw, str: raw.str.trim() };
    // The gap can also sit inside one item: "B m" for B♭m.
    const inner = /^([A-G]) +((?:m(?:aj)?|min|sus|add|dim|aug|\d)\S*)$/.exec(it.str);
    if (inner) {
      it.str = inner[1] + acc + inner[2];
      restored++;
    }
    const prev = out[out.length - 1];
    if (prev && CHORDISH.test(prev.str) && CHORD_SUFFIX.test(it.str)) {
      const gap = it.x - (prev.x + prev.w);
      const raised = it.h < prev.h * 0.9 && it.y > prev.y + 0.3;
      if (gap < prev.h * (raised ? 1 : 0.6)) {
        const missing = /^[A-G]$/.test(prev.str) && gap > prev.h * 0.2;
        if (missing) restored++;
        prev.str += (missing ? acc : ``) + it.str;
        prev.w = it.x + it.w - prev.x;
        continue;
      }
    }
    out.push(it);
  }
  return { items: out, restored };
}

/** Render lines as monospace text, placing each item by its x position so chords stay above their words. */
function linesToText(lines: PdfItem[][], left: number, charW: number): string[] {
  const out: string[] = [];
  let lastY: number | null = null;
  let lastH = 12;
  for (const items of lines) {
    if (!items.length) continue;
    const y = items[0].y;
    // A gap of well over one line means a blank line between blocks.
    if (lastY !== null && lastY - y > lastH * 1.9) out.push(``);
    lastY = y;
    lastH = Math.max(...items.map((i) => i.h)) || lastH;
    let line = ``;
    let prevEnd = -Infinity;
    for (const it of items) {
      let col = Math.max(line.length, Math.round((it.x - left) / charW));
      // Keep words apart when they collide after rounding but had a real gap on the page.
      if (col === line.length && line && !line.endsWith(` `) && !it.str.startsWith(` `) && it.x - prevEnd > charW * 0.3) col++;
      line = line.padEnd(col) + it.str;
      prevEnd = it.x + it.w;
    }
    out.push(line.replace(/\s+$/, ``));
  }
  return out;
}

/** Split a line wherever there's a very wide gap (e.g. "Anne Wilson ······ Key: F  Tempo: 76"). */
function splitWide(line: PdfItem[], charW: number): PdfItem[][] {
  const parts: PdfItem[][] = [[]];
  let prevEnd = -Infinity;
  for (const it of line) {
    if (parts[parts.length - 1].length && it.x - prevEnd > charW * 10) parts.push([]);
    parts[parts.length - 1].push(it);
    prevEnd = it.x + it.w;
  }
  return parts;
}

const SECTION_WORD = /^(?:[A-Z][A-Za-z0-9]{0,2}\s+)?(intro|verse|pre[\s-]?chorus|post[\s-]?chorus|chorus|refrain|bridge|interlude|instrumental|vamp|outro|ending|tag|solo|breakdown|turnaround)\b/i;

const BADGE_HEADING = /^[A-Z][A-Za-z0-9]{0,2}\s+[A-Z]{3,}(?:[\s-][A-Z0-9]+)*$/;

/**
 * Pull text out of a PDF so the chord-sheet parser can read it: keeps line breaks, keeps the spacing
 * that lines chords up over lyrics, reads two-column pages left column first, joins chord superscripts
 * and restores accidentals that were drawn as shapes.
 */
export async function readPdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import(`pdfjs-dist`);
  const { default: workerUrl } = await import(`pdfjs-dist/build/pdf.worker.min.mjs?url`);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  // First pass: read every page's items.
  const pages: { width: number; items: PdfItem[] }[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const raw of content.items) {
      if (!(`str` in raw) || !raw.str.trim()) continue;
      const h = Math.abs(raw.transform[3]) || Math.abs(raw.height) || 10;
      items.push({ x: raw.transform[4], y: raw.transform[5], w: raw.width, h, str: raw.str });
    }
    pages.push({ width, items });
  }

  // The song's key decides whether a missing accidental is ♭ or ♯.
  const allText = pages.flatMap((p) => p.items.map((i) => i.str)).join(` `);
  const keyMatch = /key\s*[:=-]?\s*([A-G][#b♯♭]?)\s*(m(?!aj)|min)?/i.exec(allText);
  const keyRoot = keyMatch ? normalizeKeyName(keyMatch[1]) : null;
  const keyScale = keyMatch?.[2] ? `natural-minor` : `major`;
  const acc = keyRoot && !prefersFlats(noteIndex(keyRoot), keyScale) && keyRoot !== `C` ? `♯` : `♭`;
  const inKey = new Set(keyRoot ? scaleNotes(keyRoot, keyScale).map((n) => noteIndex(n)) : []);

  const rendered: { lines: PdfItem[][]; left: number; charW: number }[] = [];
  let restoredTotal = 0;
  for (const { width, items } of pages) {
    if (!items.length) continue;
    const widths = items.filter((i) => i.str.trim().length > 1).map((i) => i.w / i.str.length);
    const charW = widths.length ? widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] : 5;

    // Header zone: everything above the first section heading is read full-width (title, key, roadmap).
    const headingY = Math.max(-Infinity, ...items.filter((i) => (SECTION_WORD.test(i.str.trim()) || BADGE_HEADING.test(i.str.trim()))).map((i) => i.y));
    const headerCut = Number.isFinite(headingY) ? headingY + 20 : Infinity;
    const header = items.filter((i) => i.y > headerCut);
    const body = items.filter((i) => i.y <= headerCut);

    // Two columns? Find a vertical gap in the middle third that (almost) no body text crosses.
    let split: number | null = null;
    let best = Infinity;
    for (let x = width * 0.35; x <= width * 0.65; x += 3) {
      const crossing = body.filter((i) => i.x < x && i.x + i.w > x).length;
      const leftCount = body.filter((i) => i.x + i.w <= x).length;
      const rightCount = body.filter((i) => i.x >= x).length;
      if (leftCount > body.length * 0.15 && rightCount > body.length * 0.15 && crossing <= Math.max(1, body.length * 0.02) && crossing < best) {
        best = crossing;
        split = x;
      }
    }

    const sections: PdfItem[][] = [header];
    if (split === null) sections.push(body);
    else sections.push(body.filter((i) => i.x + i.w / 2 < split!), body.filter((i) => i.x + i.w / 2 >= split!));
    for (const [n, group] of sections.entries()) {
      if (!group.length) continue;
      const left = Math.min(...group.map((i) => i.x));
      let lines = toLines(group).map((l) => {
        const merged = mergeChordParts(l, acc);
        restoredTotal += merged.restored;
        return merged.items;
      });
      if (n === 0) lines = lines.flatMap((l) => splitWide(l, charW));
      rendered.push({ lines, left, charW });
    }
  }

  // If the chart drops accidentals, a bare chord letter that isn't in the key but its flat/sharp is
  // (B in F major → B♭) gets the accidental back too.
  const out: string[] = [];
  for (const { lines, left, charW } of rendered) {
    const fixed = lines.map((line) => {
      const chordLine = line.every((i) => CHORDISH.test(i.str) || /^[|/.%-]+$/.test(i.str));
      if (!restoredTotal || !chordLine || !keyRoot) return line;
      return line.map((i) => {
        const m = /^([A-G])(\/[A-G][#b♯♭]?)?$/.exec(i.str);
        if (!m) return i;
        const pc = noteIndex(m[1]);
        const shifted = (pc + (acc === `♭` ? 11 : 1)) % 12;
        return !inKey.has(pc) && inKey.has(shifted) ? { ...i, str: `${m[1]}${acc}${m[2] ?? ``}` } : i;
      });
    });
    out.push(...linesToText(fixed, left, charW), ``);
  }
  const text = out.join(`\n`);
  if (!text.trim()) throw new Error(`That PDF has no text to read (it may be a scanned image).`);
  return text;
}

export type SongImport = { kind: 'songs'; songs: Song[] } | { kind: 'nashdial'; data: ParsedImport };

/** Turn any supported file into songs to add to the library. */
export async function importSongFile(file: File): Promise<SongImport> {
  const name = file.name.toLowerCase();
  const title = baseName(file.name);
  if (name.endsWith(`.json`)) return { kind: `nashdial`, data: parseImport(await file.text()) };
  if (name.endsWith(`.pdf`)) return { kind: `songs`, songs: [parseChordSheet(await readPdfText(await file.arrayBuffer()), title)] };
  if (name.endsWith(`.mxl`)) return { kind: `songs`, songs: [parseMusicXml(await readMxl(await file.arrayBuffer()), title)] };
  const text = await file.text();
  if (name.endsWith(`.musicxml`) || (name.endsWith(`.xml`) && /<score-(partwise|timewise)/.test(text))) {
    return { kind: `songs`, songs: [parseMusicXml(text, title)] };
  }
  // A NashDial export saved with another extension still works.
  if (/^\s*\{/.test(text) && /"nashdial"\s*:/.test(text)) return { kind: `nashdial`, data: parseImport(text) };
  return { kind: `songs`, songs: [parseChordSheet(text, title)] };
}

/** Open the file picker for any supported song file. */
export function pickSongFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement(`input`);
    input.type = `file`;
    if (!window.matchMedia(`(pointer: coarse)`).matches) input.accept = SONG_FILE_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener(`cancel`, () => resolve(null));
    input.click();
  });
}

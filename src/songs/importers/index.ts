import { parseImport, type ParsedImport } from '../io';
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

/** Group text items into lines, allowing a little vertical wobble (chords set slightly higher, mixed fonts). */
function toLines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfItem[] }[] = [];
  for (const it of sorted) {
    const tol = Math.max(2, it.h * 0.35);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => l.items.sort((a, b) => a.x - b.x));
}

/** Render lines as monospace text, placing each item by its x position so chords stay above their words. */
function linesToText(lines: PdfItem[][], left: number, charW: number): string[] {
  const out: string[] = [];
  let lastY: number | null = null;
  let lastH = 12;
  for (const items of lines) {
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

/**
 * Pull text out of a PDF so the chord-sheet parser can read it: keeps line breaks, keeps the spacing
 * that lines chords up over lyrics, and reads two-column pages left column first.
 */
async function readPdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import(`pdfjs-dist`);
  const { default: workerUrl } = await import(`pdfjs-dist/build/pdf.worker.min.mjs?url`);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const raw of content.items) {
      if (!(`str` in raw) || !raw.str) continue;
      const h = Math.abs(raw.transform[3]) || Math.abs(raw.height) || 10;
      items.push({ x: raw.transform[4], y: raw.transform[5], w: raw.width, h, str: raw.str });
    }
    if (!items.some((i) => i.str.trim())) continue;
    // Typical character width: median of (width / length) over text items.
    const widths = items.filter((i) => i.str.trim().length > 1).map((i) => i.w / i.str.length);
    const charW = widths.length ? widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] : 5;

    // Two columns? Look for a vertical gap in the middle third that no text crosses.
    let split: number | null = null;
    const body = items.filter((i) => i.str.trim());
    for (let x = width * 0.35; x <= width * 0.65; x += 4) {
      const crossing = body.some((i) => i.x < x && i.x + i.w > x);
      const leftCount = body.filter((i) => i.x + i.w <= x).length;
      const rightCount = body.filter((i) => i.x >= x).length;
      if (!crossing && leftCount > body.length * 0.2 && rightCount > body.length * 0.2) {
        split = x;
        break;
      }
    }
    // Title/header lines that span the page (wide items above the columns) are read first.
    const columns = split === null ? [body] : [body.filter((i) => i.x + i.w <= split!), body.filter((i) => i.x >= split!)];
    for (const col of columns) {
      const left = Math.min(...col.map((i) => i.x));
      out.push(...linesToText(toLines(col), left, charW), ``);
    }
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

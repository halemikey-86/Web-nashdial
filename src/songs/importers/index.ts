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

/** Pull text out of a PDF, keeping line breaks and the spacing that lines chords up over lyrics. */
async function readPdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import(`pdfjs-dist`);
  const { default: workerUrl } = await import(`pdfjs-dist/build/pdf.worker.min.mjs?url`);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = content.items.filter((i): i is (typeof content.items)[number] & { str: string; transform: number[]; width: number } => `str` in i);
    // Average character width sets how many spaces a horizontal gap is worth.
    const widths = items.filter((i) => i.str.trim()).map((i) => i.width / Math.max(1, i.str.length));
    const charW = widths.length ? widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] : 5;
    const lines = new Map<number, { x: number; str: string; w: number }[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5] / 2) * 2;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x: it.transform[4], str: it.str, w: it.width });
    }
    const ys = [...lines.keys()].sort((a, b) => b - a);
    let lastY: number | null = null;
    for (const y of ys) {
      if (lastY !== null && lastY - y > 22) out.push(``);
      lastY = y;
      const parts = lines.get(y)!.sort((a, b) => a.x - b.x);
      let line = ``;
      for (const part of parts) {
        const col = Math.max(line.length, Math.round(part.x / charW) - 6);
        line = line.padEnd(col) + part.str;
      }
      out.push(line.replace(/\s+$/, ``));
    }
    out.push(``);
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

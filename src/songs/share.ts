import type { ExportFile } from './io';

/**
 * Share links carry the song or setlist itself, compressed into the URL:
 *   https://<site>/#/share/z<base64url(deflate(json))>
 * No server is involved — opening the link on another device offers to add it to that library.
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = ``;
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, `-`).replace(/\//g, `_`).replace(/=+$/, ``);
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, `+`).replace(/_/g, `/`) + `===`.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeShare(file: ExportFile): Promise<string> {
  const json = JSON.stringify(file);
  if (typeof CompressionStream !== `undefined`) {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream(`deflate-raw`));
    return `z${toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  }
  return `j${toBase64Url(new TextEncoder().encode(json))}`;
}

export async function decodeShare(code: string): Promise<string> {
  const kind = code[0];
  const bytes = fromBase64Url(code.slice(1));
  if (kind === `j`) return new TextDecoder().decode(bytes);
  if (kind !== `z`) throw new Error(`That share link isn't complete.`);
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream(`deflate-raw`));
  return new Response(stream).text();
}

export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}#/share/${code}`;
}

/** Accept a full share link or just the code. */
export function extractShareCode(input: string): string | null {
  const text = input.trim();
  const fromUrl = /#\/share\/([A-Za-z0-9_-]+)/.exec(text);
  if (fromUrl) return fromUrl[1];
  return /^[zj][A-Za-z0-9_-]{16,}$/.test(text) ? text : null;
}

/** Share with the system share sheet where available, otherwise copy the link. Returns what happened. */
export async function shareFile(file: ExportFile, title: string): Promise<'shared' | 'copied' | 'cancelled' | 'shown'> {
  const url = shareUrl(await encodeShare(file));
  const text = `${title} — tap to add it to NashDial`;
  if (navigator.share && window.matchMedia(`(pointer: coarse)`).matches) {
    try {
      await navigator.share({ title, text, url });
      return `shared`;
    } catch (err) {
      if ((err as DOMException).name === `AbortError`) return `cancelled`;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return `copied`;
  } catch {
    prompt(`Copy this link and send it:`, url);
    return `shown`;
  }
}

/** Compact ID3v2.3 / v2.4 tag parser — title, artist, album, embedded artwork. */

export interface TrackMeta {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: Blob;
}

const MAX_READ = 4_000_000;

function syncsafe(u8: Uint8Array, off: number): number {
  return ((u8[off] & 0x7f) << 21) | ((u8[off + 1] & 0x7f) << 14) | ((u8[off + 2] & 0x7f) << 7) | (u8[off + 3] & 0x7f);
}

function plain32(u8: Uint8Array, off: number): number {
  return (u8[off] << 24) | (u8[off + 1] << 16) | (u8[off + 2] << 8) | u8[off + 3];
}

function stripNulls(s: string): string {
  return s.replace(/[\u0000\ufeff\ufffe]+/g, "").trim();
}

function decodeText(body: Uint8Array): string {
  if (body.length < 2) return "";
  const enc = body[0];
  let data = body.subarray(1);
  try {
    if (enc === 0) return stripNulls(new TextDecoder("windows-1252").decode(data));
    if (enc === 3) return stripNulls(new TextDecoder("utf-8").decode(data));
    if (enc === 1 || enc === 2) {
      let label = "utf-16le";
      if (data.length >= 2) {
        if (data[0] === 0xfe && data[1] === 0xff) {
          label = "utf-16be";
          data = data.subarray(2);
        } else if (data[0] === 0xff && data[1] === 0xfe) {
          data = data.subarray(2);
        } else if (enc === 2) {
          label = "utf-16be";
        }
      } else if (enc === 2) {
        label = "utf-16be";
      }
      return stripNulls(new TextDecoder(label).decode(data));
    }
  } catch {
    return "";
  }
  return "";
}

/** Remove ID3 unsynchronisation (0xFF 0x00 -> 0xFF). */
function deunsync(u8: Uint8Array) {
  const out = new Uint8Array(u8.length);
  let w = 0;
  for (let i = 0; i < u8.length; i++) {
    out[w++] = u8[i];
    if (u8[i] === 0xff && u8[i + 1] === 0x00) i++;
  }
  return out.slice(0, w);
}

function parseApic(body: Uint8Array): Blob | undefined {
  try {
    const enc = body[0];
    let p = 1;
    let mime = "";
    while (p < body.length && body[p] !== 0) {
      mime += String.fromCharCode(body[p]);
      p++;
    }
    p++; // mime terminator
    p++; // picture type
    if (enc === 1 || enc === 2) {
      while (p + 1 < body.length && !(body[p] === 0 && body[p + 1] === 0)) p += 2;
      p += 2;
    } else {
      while (p < body.length && body[p] !== 0) p++;
      p++;
    }
    if (p >= body.length) return undefined;
    const type = /^image\/[\w+-]+$/.test(mime) ? mime : "image/jpeg";
    const data = body.subarray(p);
    const copy = new Uint8Array(data.length);
    copy.set(data);
    return new Blob([copy], { type });
  } catch {
    return undefined;
  }
}

export async function parseID3(file: File): Promise<TrackMeta | null> {
  try {
    const headBuf = await file.slice(0, 10).arrayBuffer();
    const head = new Uint8Array(headBuf);
    if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
    const ver = head[3];
    if (ver !== 3 && ver !== 4) return null;
    const flags = head[5];
    const size = syncsafe(head, 6);
    if (size <= 0) return null;

    let raw = new Uint8Array(await file.slice(10, 10 + Math.min(size, MAX_READ)).arrayBuffer());
    if (flags & 0x80) raw = deunsync(raw);

    let off = 0;
    if (flags & 0x40) {
      const ext = ver === 4 ? syncsafe(raw, 0) : plain32(raw, 0) + 4;
      off += Math.max(ext, 0);
    }

    const meta: TrackMeta = {};
    const u8 = raw;
    while (off + 10 <= u8.length) {
      const id = String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fsz = ver === 4 ? syncsafe(u8, off + 4) : plain32(u8, off + 4);
      off += 10;
      if (fsz <= 0 || off + fsz > u8.length) break;
      const body = u8.subarray(off, off + fsz);
      off += fsz;

      switch (id) {
        case "TIT2":
          if (!meta.title) meta.title = decodeText(body);
          break;
        case "TPE1":
          if (!meta.artist) meta.artist = decodeText(body);
          break;
        case "TALB":
          if (!meta.album) meta.album = decodeText(body);
          break;
        case "APIC":
          if (!meta.artwork) meta.artwork = parseApic(body);
          break;
      }
      if (meta.title && meta.artist && meta.album && meta.artwork) break;
    }
    return meta.title || meta.artist || meta.album || meta.artwork ? meta : null;
  } catch {
    return null;
  }
}

// Big .zip files (the Viewer data, up to VIEWER_DATA_MAX_BYTES) without holding them in memory.
//
// Reading: the zip's central directory (at its end) lists every entry with its sizes before anything is
// decompressed, so the limits are checked first. Each entry is then read on its own from its slice of the file: a
// stored entry (a .glb is stored, it is already compressed) is just that slice, without copying a byte; a deflated
// one is inflated chunk by chunk into a Blob. Blobs live in the browser's storage, not in the page's memory: a
// 1.5 GB model is uploaded from its Blob as it is.
//
// Writing: entries are added one at a time and read chunk by chunk from their Blobs; the output is gathered in
// Blob parts of ZIP_PART_BYTES, so the zip is never one big array either.
//
// ZIP64 is not read (a zip under 4 GB does not need it, and fflate never writes it).
import { Inflate, Zip, ZipDeflate, ZipPassThrough } from "fflate";

export interface ZipEntry {
    path: string;
    // 0 stored, 8 deflated
    method: number;
    compressedSize: number;
    size: number;
    // where its local header starts in the file
    offset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
// the end of central directory record is 22 bytes plus a comment of at most 65535
const EOCD_SEARCH = 22 + 0xffff;
const ZIP_PART_BYTES = 32 * 1024 * 1024;

const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const decodeName = (bytes: Uint8Array, utf8: boolean) => {
    if (utf8) return new TextDecoder("utf-8").decode(bytes);
    // CP437 for the ASCII range is ASCII; the rest is rare in the names of these files
    return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
};

// The entries of a zip, from its central directory; folders are left out
export const listZipEntries = async (zip: Blob): Promise<ZipEntry[] | { error: string }> => {
    if (zip.size < 22) return { error: "The file is not a valid zip." };
    const tailStart = Math.max(0, zip.size - EOCD_SEARCH);
    const tail = await bytesOf(zip.slice(tailStart));
    const tailView = viewOf(tail);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (tailView.getUint32(i, true) === EOCD_SIGNATURE) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) return { error: "The file is not a valid zip." };
    const count = tailView.getUint16(eocd + 10, true);
    const cdSize = tailView.getUint32(eocd + 12, true);
    const cdOffset = tailView.getUint32(eocd + 16, true);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
        return { error: "ZIP64 archives are not supported: make the zip with a smaller size or another tool." };
    }
    if (cdOffset + cdSize > zip.size) return { error: "The file is not a valid zip." };

    const cd = await bytesOf(zip.slice(cdOffset, cdOffset + cdSize));
    const view = viewOf(cd);
    const entries: ZipEntry[] = [];
    let p = 0;
    for (let n = 0; n < count; n++) {
        if (p + 46 > cd.length || view.getUint32(p, true) !== CENTRAL_SIGNATURE) return { error: "The zip's directory is damaged." };
        const flags = view.getUint16(p + 8, true);
        const method = view.getUint16(p + 10, true);
        const compressedSize = view.getUint32(p + 20, true);
        const size = view.getUint32(p + 24, true);
        const nameLength = view.getUint16(p + 28, true);
        const extraLength = view.getUint16(p + 30, true);
        const commentLength = view.getUint16(p + 32, true);
        const offset = view.getUint32(p + 42, true);
        const path = decodeName(cd.subarray(p + 46, p + 46 + nameLength), (flags & 0x800) !== 0);
        p += 46 + nameLength + extraLength + commentLength;
        if (path.endsWith("/")) continue;
        if (flags & 0x1) return { error: `${path}: encrypted zips are not supported.` };
        if (method !== 0 && method !== 8) return { error: `${path}: unsupported compression (only stored and deflate).` };
        entries.push({ path, method, compressedSize, size, offset });
    }
    return entries;
};

// One entry's content as a Blob
export const readZipEntry = async (zip: Blob, entry: ZipEntry, type = ""): Promise<Blob> => {
    const header = viewOf(await bytesOf(zip.slice(entry.offset, entry.offset + 30)));
    if (header.getUint32(0, true) !== LOCAL_SIGNATURE) throw new Error(`${entry.path}: damaged entry`);
    const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    const data = zip.slice(start, start + entry.compressedSize);
    if (entry.method === 0) return type ? new Blob([data], { type }) : data;

    const parts: Blob[] = [];
    let chunks: Uint8Array[] = [];
    let pending = 0;
    let total = 0;
    const flush = () => {
        if (chunks.length > 0) parts.push(new Blob(chunks as BlobPart[]));
        chunks = [];
        pending = 0;
    };
    const inflate = new Inflate((chunk) => {
        chunks.push(chunk);
        pending += chunk.length;
        total += chunk.length;
        if (pending >= ZIP_PART_BYTES) flush();
    });
    const reader = data.stream().getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        inflate.push(value);
    }
    inflate.push(new Uint8Array(0), true);
    flush();
    if (total !== entry.size) throw new Error(`${entry.path}: damaged entry (size ${total}, expected ${entry.size})`);
    return new Blob(parts, { type });
};

export interface ZipInput {
    path: string;
    data: Blob;
    // stored when false (files already compressed: .glb, .zip, images)
    deflate: boolean;
}

// A zip of the given files, as a Blob
export const writeZip = async (files: ZipInput[], onProgress?: (fraction: number) => void): Promise<Blob> => {
    const parts: Blob[] = [];
    let chunks: Uint8Array[] = [];
    let pending = 0;
    let finished!: () => void;
    let failed!: (error: Error) => void;
    const done = new Promise<void>((resolve, reject) => {
        finished = resolve;
        failed = reject;
    });
    const zip = new Zip((error, chunk, final) => {
        if (error) {
            failed(error);
            return;
        }
        chunks.push(chunk);
        pending += chunk.length;
        if (pending >= ZIP_PART_BYTES || final) {
            parts.push(new Blob(chunks as BlobPart[]));
            chunks = [];
            pending = 0;
        }
        if (final) finished();
    });
    const totalBytes = files.reduce((sum, f) => sum + f.data.size, 0) || 1;
    let readBytes = 0;
    for (const file of files) {
        const entry = file.deflate ? new ZipDeflate(file.path, { level: 6 }) : new ZipPassThrough(file.path);
        zip.add(entry);
        if (file.data.size === 0) {
            entry.push(new Uint8Array(0), true);
            continue;
        }
        const reader = file.data.stream().getReader();
        let next = await reader.read();
        while (!next.done) {
            const value = next.value;
            next = await reader.read();
            entry.push(value, next.done);
            readBytes += value.length;
            onProgress?.(readBytes / totalBytes);
        }
    }
    zip.end();
    await done;
    return new Blob(parts, { type: "application/zip" });
};

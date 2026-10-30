/**
 * Metadata, EXIF, GPS & C2PA/JUMBF Sanitizer Worker
 * Strips sensitive tracking metadata from JPEG and PNG files and exports batch ZIPs via fflate.
 */
import { zipSync } from 'fflate';

export interface SanitizationResult {
  filename: string;
  originalSizeBytes: number;
  sanitizedSizeBytes: number;
  strippedMarkers: string[];
  sanitizedBuffer: Uint8Array;
}

/**
 * Binary JPEG marker parser and sanitizer.
 * Strips EXIF (0xFFE1), XMP (0xFFE1), IPTC (0xFFED), C2PA/JUMBF (0xFFEB), and COM (0xFFFE).
 */
export function stripJpegMetadataChunks(inputBuffer: ArrayBuffer | Uint8Array): {
  buffer: Uint8Array;
  stripped: string[];
} {
  const src = inputBuffer instanceof Uint8Array ? inputBuffer : new Uint8Array(inputBuffer);
  if (src.byteLength < 4 || src[0] !== 0xff || src[1] !== 0xd8) {
    return { buffer: new Uint8Array(src), stripped: [] };
  }

  const chunks: Uint8Array[] = [];
  const stripped: string[] = [];

  // Always keep SOI (0xFFD8)
  chunks.push(src.subarray(0, 2));

  let offset = 2;
  while (offset < src.byteLength) {
    if (src[offset] !== 0xff) {
      // Seek next 0xFF marker
      offset++;
      continue;
    }

    const marker = src[offset + 1];

    // Standalone markers without payload
    if (marker === 0xd8) {
      // Duplicate SOI
      offset += 2;
      continue;
    }
    if (marker === 0xd9) {
      // EOI (End of Image)
      chunks.push(src.subarray(offset, offset + 2));
      break;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      // RST (Restart) or escaped 0xFF00 in entropy-coded scan
      offset += 2;
      continue;
    }

    if (offset + 4 > src.byteLength) {
      // Truncated marker at end
      break;
    }

    const segLen = (src[offset + 2] << 8) | src[offset + 3];
    const segEnd = offset + 2 + segLen;

    if (segEnd > src.byteLength) {
      // Truncated segment, keep whatever remains or stop
      break;
    }

    // Identify and filter metadata segments
    if (marker === 0xe1) {
      // APP1: Exif, XMP
      const isExif = src.byteLength > offset + 8 &&
        src[offset + 4] === 0x45 && src[offset + 5] === 0x78 &&
        src[offset + 6] === 0x69 && src[offset + 7] === 0x66; // "Exif"
      const label = isExif ? 'EXIF/GPS' : 'XMP';
      if (!stripped.includes(label)) stripped.push(label);
    } else if (marker === 0xed) {
      // APP13: IPTC / Photoshop IRB
      if (!stripped.includes('IPTC')) stripped.push('IPTC');
    } else if (marker === 0xeb) {
      // APP11: C2PA / JUMBF Manifest
      if (!stripped.includes('C2PA')) stripped.push('C2PA');
    } else if (marker === 0xfe) {
      // COM: Comment text
      if (!stripped.includes('COM')) stripped.push('COM');
    } else if (marker === 0xda) {
      // SOS (Start of Scan): scan data continues until EOI
      chunks.push(src.subarray(offset, src.byteLength));
      break;
    } else {
      // Keep compliant structural markers (JFIF APP0 0xE0, DQT 0xDB, SOF 0xC0..0xC3, DHT 0xC4, DRI 0xDD)
      chunks.push(src.subarray(offset, segEnd));
    }

    offset = segEnd;
  }

  // Calculate total sanitized length and merge chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const c of chunks) {
    out.set(c, writeOffset);
    writeOffset += c.byteLength;
  }

  // Ensure file concludes with EOI (0xFFD9)
  if (out.byteLength >= 2) {
    if (out[out.byteLength - 2] !== 0xff || out[out.byteLength - 1] !== 0xd9) {
      const withEoi = new Uint8Array(out.byteLength + 2);
      withEoi.set(out, 0);
      withEoi[out.byteLength] = 0xff;
      withEoi[out.byteLength + 1] = 0xd9;
      return { buffer: withEoi, stripped };
    }
  }

  return { buffer: out, stripped };
}

/**
 * Binary PNG chunk parser and sanitizer.
 * Strips text chunks (tEXt, zTXt, iTXt), eXIf, and tIME while preserving IHDR, IDAT, PLTE, tRNS, IEND.
 */
export function stripPngMetadataChunks(inputBuffer: ArrayBuffer | Uint8Array): {
  buffer: Uint8Array;
  stripped: string[];
} {
  const src = inputBuffer instanceof Uint8Array ? inputBuffer : new Uint8Array(inputBuffer);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (src.byteLength < 8) return { buffer: new Uint8Array(src), stripped: [] };
  for (let i = 0; i < 8; i++) {
    if (src[i] !== PNG_SIG[i]) return { buffer: new Uint8Array(src), stripped: [] };
  }

  const chunks: Uint8Array[] = [];
  const stripped: string[] = [];

  // Keep PNG 8-byte signature
  chunks.push(src.subarray(0, 8));

  let offset = 8;
  while (offset + 12 <= src.byteLength) {
    const dataLen =
      (src[offset] << 24) |
      (src[offset + 1] << 16) |
      (src[offset + 2] << 8) |
      src[offset + 3];

    const typeCode = String.fromCharCode(
      src[offset + 4],
      src[offset + 5],
      src[offset + 6],
      src[offset + 7]
    );

    const chunkTotalLen = 12 + dataLen; // 4 len + 4 type + dataLen + 4 crc
    if (offset + chunkTotalLen > src.byteLength) break;

    // Filter out metadata chunks
    if (['tEXt', 'zTXt', 'iTXt'].includes(typeCode)) {
      if (!stripped.includes('XMP/Text')) stripped.push('XMP/Text');
    } else if (typeCode === 'eXIf') {
      if (!stripped.includes('EXIF')) stripped.push('EXIF');
    } else if (typeCode === 'tIME') {
      if (!stripped.includes('Timestamp')) stripped.push('Timestamp');
    } else {
      // Keep vital rendering chunks (IHDR, PLTE, IDAT, tRNS, IEND)
      chunks.push(src.subarray(offset, offset + chunkTotalLen));
    }

    if (typeCode === 'IEND') break;
    offset += chunkTotalLen;
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const c of chunks) {
    out.set(c, writeOffset);
    writeOffset += c.byteLength;
  }

  return { buffer: out, stripped };
}

/**
 * Universal file sanitizer: detects JPEG or PNG and applies the corresponding scrubber.
 */
export function sanitizeImageFile(
  buffer: ArrayBuffer | Uint8Array,
  filename: string
): SanitizationResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const isJpeg = bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng =
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  let sanitized: Uint8Array = bytes;
  let strippedMarkers: string[] = [];

  if (isJpeg) {
    const res = stripJpegMetadataChunks(bytes);
    sanitized = res.buffer;
    strippedMarkers = res.stripped;
  } else if (isPng) {
    const res = stripPngMetadataChunks(bytes);
    sanitized = res.buffer;
    strippedMarkers = res.stripped;
  }

  return {
    filename,
    originalSizeBytes: bytes.byteLength,
    sanitizedSizeBytes: sanitized.byteLength,
    strippedMarkers,
    sanitizedBuffer: sanitized,
  };
}

/**
 * Batch packaging: creates a single .ZIP archive containing all sanitized files via fflate.
 */
export function createBatchZipArchive(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const zipObj: Record<string, Uint8Array> = {};
  for (const f of files) {
    zipObj[f.name] = f.data;
  }
  return zipSync(zipObj, { level: 6 });
}

// Web Worker message listener for batch off-thread processing
if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'sanitizeFile') {
        const { buffer, filename } = data;
        const result = sanitizeImageFile(buffer, filename);
        (self as any).postMessage({ id, result }, [result.sanitizedBuffer.buffer]);
      } else if (action === 'createBatchZip') {
        const { files } = data;
        const zipBytes = createBatchZipArchive(files);
        (self as any).postMessage({ id, zipBytes }, [zipBytes.buffer]);
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}

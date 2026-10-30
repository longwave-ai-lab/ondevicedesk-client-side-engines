/**
 * 1D Parabolic Lower Envelope Euclidean Distance Transform (Felzenszwalb & Huttenlocher).
 * Runs in exact O(N) time without approximations.
 */
export function edt1d(
  f: Float32Array,
  d: Float32Array,
  v: Int32Array,
  z: Float32Array,
  n: number
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
}

/**
 * True linear-time O(W*H) 2-pass 2D Euclidean Distance Transform.
 * Dilates opaque foreground shapes by `borderRadiusPx` with an optional anti-aliased feather edge.
 */
export function generateDieCutAlphaBorder(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  borderRadiusPx: number,
  featherPx: number = 2.0
): Uint8ClampedArray {
  const total = width * height;
  const INF = 1e12;
  const grid = new Float32Array(total);
  let hasForeground = false;

  for (let i = 0; i < total; i++) {
    const isFg = rgba[i * 4 + 3] > 24;
    if (isFg) hasForeground = true;
    grid[i] = isFg ? 0 : INF;
  }

  const borderMask = new Uint8ClampedArray(total);
  if (!hasForeground) return borderMask;

  const maxDim = Math.max(width, height);
  const f = new Float32Array(maxDim);
  const d = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);

  // Pass 1: 1D Parabolic Lower Envelope along columns
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }

  // Pass 2: 1D Parabolic Lower Envelope along rows + Anti-Aliased Alpha Ramp
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) f[x] = grid[rowOffset + x];
    edt1d(f, d, v, z, width);

    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt(d[x]);
      if (dist <= borderRadiusPx) {
        borderMask[rowOffset + x] = 255;
      } else if (featherPx > 0 && dist <= borderRadiusPx + featherPx) {
        const t = 1.0 - (dist - borderRadiusPx) / featherPx;
        borderMask[rowOffset + x] = Math.round(t * 255);
      } else {
        borderMask[rowOffset + x] = 0;
      }
    }
  }

  return borderMask;
}

/**
 * Parses hex color to RGB tuple.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 203, g: 213, b: 225 };
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/**
 * Composites the foreground RGBA over the dilated white vinyl border (#FFFFFF)
 * and outer kiss-cut contour line (default #CBD5E1).
 */
export function compositeDieCutSticker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  borderRadiusPx: number,
  featherPx: number = 2.0,
  rimHex: string = '#CBD5E1',
  borderFillHex: string = '#FFFFFF',
  borderAlphaFactor: number = 1.0
): Uint8ClampedArray {
  const mask = generateDieCutAlphaBorder(rgba, width, height, borderRadiusPx, featherPx);
  const out = new Uint8ClampedArray(width * height * 4);
  const rimColor = hexToRgb(rimHex);
  const fillColor = hexToRgb(borderFillHex);
  const clampedAlphaFactor = Math.max(0.2, Math.min(1.0, borderAlphaFactor));

  for (let i = 0; i < width * height; i++) {
    const bAlpha = (mask[i] / 255) * clampedAlphaFactor;
    if (bAlpha <= 0) continue;

    const idx = i * 4;
    const fgA = rgba[idx + 3] / 255;
    const outA = fgA + bAlpha * (1 - fgA);

    // Subtle kiss-cut rim on the outer feather edge, vinyl fill color inside
    const isOuterRim = bAlpha > 0.12 * clampedAlphaFactor && bAlpha < 0.85 * clampedAlphaFactor && fgA === 0;
    const bgR = isOuterRim ? rimColor.r : fillColor.r;
    const bgG = isOuterRim ? rimColor.g : fillColor.g;
    const bgB = isOuterRim ? rimColor.b : fillColor.b;

    out[idx] = Math.round((rgba[idx] * fgA + bgR * bAlpha * (1 - fgA)) / outA);
    out[idx + 1] = Math.round((rgba[idx + 1] * fgA + bgG * bAlpha * (1 - fgA)) / outA);
    out[idx + 2] = Math.round((rgba[idx + 2] * fgA + bgB * bAlpha * (1 - fgA)) / outA);
    out[idx + 3] = Math.round(outA * 255);
  }

  return out;
}

/**
 * Connected-component BFS flood-fill background eraser starting at (startX, startY).
 * Sets alpha = 0 for all connected pixels within Euclidean RGB distance <= tolerance.
 */
export function floodEraseBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number = 32
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  if (width <= 0 || height <= 0) return out;
  const sx = Math.max(0, Math.min(width - 1, Math.floor(startX)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(startY)));
  const startPos = sy * width + sx;
  const startIdx = startPos * 4;
  if (out[startIdx + 3] === 0) return out;

  const refR = out[startIdx];
  const refG = out[startIdx + 1];
  const refB = out[startIdx + 2];

  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  visited[startPos] = 1;
  queue[tail++] = startPos;

  while (head < tail) {
    const curr = queue[head++];
    const cIdx = curr * 4;
    out[cIdx + 3] = 0;

    const cx = curr % width;
    const cy = (curr - cx) / width;
    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < width - 1 ? curr + 1 : -1,
      cy > 0 ? curr - width : -1,
      cy < height - 1 ? curr + width : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const np = neighbors[i];
      if (np < 0 || visited[np]) continue;
      visited[np] = 1;
      const nIdx = np * 4;
      if (out[nIdx + 3] === 0) continue;
      const dist = Math.hypot(out[nIdx] - refR, out[nIdx + 1] - refG, out[nIdx + 2] - refB);
      if (dist <= tolerance) {
        queue[tail++] = np;
      }
    }
  }

  return out;
}

export interface StickerBgCluster {
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Samples all 4 outer perimeter edges and clusters background colors into up to 8 centroids.
 * Handles multi-colored or textured backgrounds around a sticker subject.
 */
export function clusterStickerPerimeter(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxClusters: number = 8
): StickerBgCluster[] {
  const samples: Array<[number, number, number]> = [];
  const borderDepth = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) * 0.06)));

  for (let y = 0; y < height; y++) {
    const isTopOrBottom = y < borderDepth || y >= height - borderDepth;
    for (let x = 0; x < width; x++) {
      const isLeftOrRight = x < borderDepth || x >= width - borderDepth;
      if (!isTopOrBottom && !isLeftOrRight) continue;
      const idx = (y * width + x) * 4;
      if (rgba[idx + 3] > 16) {
        samples.push([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
      }
    }
  }

  if (samples.length === 0) {
    return [];
  }

  const clusters: StickerBgCluster[] = [];
  const mergeRadius = 26;

  for (let i = 0; i < samples.length; i++) {
    const [sr, sg, sb] = samples[i];
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      const cl = clusters[c];
      const d = Math.hypot(sr - cl.r, sg - cl.g, sb - cl.b);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = c;
      }
    }

    if (bestIdx >= 0 && bestDist <= mergeRadius) {
      const cl = clusters[bestIdx];
      const nextCount = cl.count + 1;
      cl.r = (cl.r * cl.count + sr) / nextCount;
      cl.g = (cl.g * cl.count + sg) / nextCount;
      cl.b = (cl.b * cl.count + sb) / nextCount;
      cl.count = nextCount;
    } else if (clusters.length < maxClusters) {
      clusters.push({ r: sr, g: sg, b: sb, count: 1 });
    } else if (bestIdx >= 0) {
      const cl = clusters[bestIdx];
      const nextCount = cl.count + 1;
      cl.r = (cl.r * cl.count + sr) / nextCount;
      cl.g = (cl.g * cl.count + sg) / nextCount;
      cl.b = (cl.b * cl.count + sb) / nextCount;
      cl.count = nextCount;
    }
  }

  for (let iter = 0; iter < 2; iter++) {
    const sums = clusters.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let i = 0; i < samples.length; i++) {
      const [sr, sg, sb] = samples[i];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < clusters.length; c++) {
        const cl = clusters[c];
        const d = Math.hypot(sr - cl.r, sg - cl.g, sb - cl.b);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      sums[bestIdx].r += sr;
      sums[bestIdx].g += sg;
      sums[bestIdx].b += sb;
      sums[bestIdx].count++;
    }
    for (let c = 0; c < clusters.length; c++) {
      if (sums[c].count > 0) {
        clusters[c].r = sums[c].r / sums[c].count;
        clusters[c].g = sums[c].g / sums[c].count;
        clusters[c].b = sums[c].b / sums[c].count;
        clusters[c].count = sums[c].count;
      }
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  return clusters;
}

/**
 * Multi-Cluster Border-Model & Saliency Subject Alpha Segmenter for Sticker Maker.
 * Strips both uniform and cluttered multi-colored backgrounds to alpha = 0
 * with morphological island cleanup and 2px boundary feathering while preserving the central subject.
 */
export function smartSegmentSubjectAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number = 32,
  externalConfidenceMask?: Uint8Array | Uint8ClampedArray | Float32Array
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return out;

  const total = width * height;
  const bgClusters = clusterStickerPerimeter(out, width, height, 8);
  if (bgClusters.length === 0) return out;

  const primaryBg = bgClusters[0];
  const minBgDist = new Float32Array(total);
  const primaryBgDist = new Float32Array(total);
  const spatialCorePrior = new Float32Array(total);

  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusX = Math.max(2, width * 0.26);
  const radiusY = Math.max(2, height * 0.26);

  for (let y = 0; y < height; y++) {
    const dy = (y - centerY) / radiusY;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const idx = p * 4;
      const r = out[idx];
      const g = out[idx + 1];
      const b = out[idx + 2];

      let bestD = Infinity;
      for (let c = 0; c < bgClusters.length; c++) {
        const cl = bgClusters[c];
        const d = Math.hypot(r - cl.r, g - cl.g, b - cl.b);
        if (d < bestD) bestD = d;
      }
      minBgDist[p] = bestD;
      primaryBgDist[p] = Math.hypot(r - primaryBg.r, g - primaryBg.g, b - primaryBg.b);

      const dx = (x - centerX) / radiusX;
      const rNorm = Math.hypot(dx, dy);
      if (rNorm <= 0.78) {
        spatialCorePrior[p] = 1.0;
      } else if (rNorm <= 1.20) {
        spatialCorePrior[p] = 1.0 - (rNorm - 0.78) / 0.42;
      } else {
        spatialCorePrior[p] = 0.0;
      }
    }
  }

  const visited = new Uint8Array(total);
  const bgMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const canBeBackground = (p: number, prevP: number): boolean => {
    const idx = p * 4;
    if (out[idx + 3] === 0) return true;
    const core = spatialCorePrior[p];
    const dBg = minBgDist[p];

    if (core >= 0.85) {
      return primaryBgDist[p] <= Math.min(16, tolerance * 0.45);
    }
    if (core > 0.15) {
      const localTol = tolerance * (1.12 - 0.52 * core);
      if (dBg > localTol) return false;
      if (prevP >= 0) {
        const pIdx = prevP * 4;
        const step = Math.hypot(
          out[idx] - out[pIdx],
          out[idx + 1] - out[pIdx + 1],
          out[idx + 2] - out[pIdx + 2]
        );
        if (step > tolerance * 0.85 && primaryBgDist[p] > tolerance * 0.75) {
          return false;
        }
      }
      return true;
    }

    if (dBg <= tolerance * 1.22) return true;
    if (prevP >= 0) {
      const pIdx = prevP * 4;
      const step = Math.hypot(
        out[idx] - out[pIdx],
        out[idx + 1] - out[pIdx + 1],
        out[idx + 2] - out[pIdx + 2]
      );
      if (step <= tolerance * 0.45 && dBg <= tolerance * 1.55) {
        return true;
      }
    }
    return false;
  };

  const pushSeed = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    if (canBeBackground(p, -1)) {
      visited[p] = 1;
      bgMask[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < width; x++) {
    pushSeed(x, 0);
    pushSeed(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    pushSeed(0, y);
    pushSeed(width - 1, y);
  }

  const dx8 = [-1, 1, 0, 0, -1, 1, -1, 1];
  const dy8 = [0, 0, -1, 1, -1, -1, 1, 1];

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % width;
    const cy = (curr - cx) / width;

    for (let dir = 0; dir < 8; dir++) {
      const nx = cx + dx8[dir];
      const ny = cy + dy8[dir];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const np = ny * width + nx;
      if (visited[np]) continue;
      visited[np] = 1;
      if (canBeBackground(np, curr)) {
        bgMask[np] = 1;
        queue[tail++] = np;
      }
    }
  }

  // Morphological cleanup: absorb small isolated background clutter pockets outside the central subject core
  const compVisited = new Uint8Array(total);
  const compQueue = new Int32Array(total);
  const maxClutterIslandArea = Math.max(4, Math.floor(total * 0.015));

  for (let p = 0; p < total; p++) {
    if (bgMask[p] === 0 && !compVisited[p] && spatialCorePrior[p] < 0.35) {
      let cHead = 0;
      let cTail = 0;
      let touchesCore = false;
      compVisited[p] = 1;
      compQueue[cTail++] = p;

      while (cHead < cTail) {
        const curr = compQueue[cHead++];
        if (spatialCorePrior[curr] >= 0.55) {
          touchesCore = true;
        }
        const cx = curr % width;
        const cy = (curr - cx) / width;
        for (let dir = 0; dir < 4; dir++) {
          const nx = cx + dx8[dir];
          const ny = cy + dy8[dir];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const np = ny * width + nx;
          if (bgMask[np] === 0 && !compVisited[np]) {
            compVisited[np] = 1;
            compQueue[cTail++] = np;
          }
        }
      }

      if (!touchesCore && cTail <= maxClutterIslandArea) {
        for (let i = 0; i < cTail; i++) {
          bgMask[compQueue[i]] = 1;
        }
      }
    }
  }

  const featherRange = 18;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const idx = p * 4;
      if (bgMask[p] === 1) {
        out[idx + 3] = 0;
      } else {
        let touchesBg = false;
        for (let dir = 0; dir < 8; dir++) {
          const nx = x + dx8[dir];
          const ny = y + dy8[dir];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (bgMask[ny * width + nx] === 1) {
              touchesBg = true;
              break;
            }
          }
        }
        if (touchesBg && minBgDist[p] < tolerance + featherRange) {
          const fgWeight = Math.max(0.2, Math.min(1.0, (minBgDist[p] - tolerance * 0.75) / (featherRange + tolerance * 0.25)));
          out[idx + 3] = Math.round(out[idx + 3] * fgWeight);
        }
      }

      if (externalConfidenceMask && externalConfidenceMask.length === total) {
        const extVal = externalConfidenceMask[p];
        const extAlpha = extVal <= 1.0 && !(externalConfidenceMask instanceof Uint8Array || externalConfidenceMask instanceof Uint8ClampedArray)
          ? Math.round(Math.max(0, Math.min(1, extVal)) * 255)
          : Math.round(Math.max(0, Math.min(255, extVal)));
        out[idx + 3] = Math.round(out[idx + 3] * 0.35 + extAlpha * 0.65);
      }
    }
  }

  return out;
}

/**
 * Strips solid, gradient, or multi-colored background around a sticker subject.
 */
export function autoStripCornerBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number = 32,
  externalConfidenceMask?: Uint8Array | Uint8ClampedArray | Float32Array
): Uint8ClampedArray {
  return smartSegmentSubjectAlpha(rgba, width, height, tolerance, externalConfidenceMask);
}

export interface StickerExportPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  format: 'image/webp' | 'image/png';
  maxSizeBytes: number;
  dpi?: number;
}

export const STICKER_EXPORT_PRESETS: Record<string, StickerExportPreset> = {
  telegram: {
    id: 'telegram',
    name: 'Telegram Sticker',
    width: 512,
    height: 512,
    format: 'image/webp',
    maxSizeBytes: 64 * 1024, // < 64KB
  },
  discord: {
    id: 'discord',
    name: 'Discord Sticker / Emoji',
    width: 320,
    height: 320,
    format: 'image/png',
    maxSizeBytes: 512 * 1024, // < 512KB
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp Sticker',
    width: 512,
    height: 512,
    format: 'image/webp',
    maxSizeBytes: 100 * 1024, // < 100KB
  },
  cricut: {
    id: 'cricut',
    name: 'Cricut 300 DPI Print Sheet',
    width: 2550, // 8.5" at 300 DPI
    height: 3300, // 11" at 300 DPI
    format: 'image/png',
    maxSizeBytes: 25 * 1024 * 1024,
    dpi: 300,
  },
};

/**
 * Resizes an RGBA buffer while maintaining aspect ratio and centering the content.
 */
export function resizeRgbaBuffer(
  srcRgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  fit: 'contain' | 'cover' | 'fill' = 'contain'
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const out = new Uint8ClampedArray(targetW * targetH * 4);
  const scale = fit === 'contain'
    ? Math.min(targetW / srcW, targetH / srcH)
    : fit === 'cover'
      ? Math.max(targetW / srcW, targetH / srcH)
      : 1.0;

  const fittedW = fit === 'fill' ? targetW : Math.max(1, Math.round(srcW * scale));
  const fittedH = fit === 'fill' ? targetH : Math.max(1, Math.round(srcH * scale));
  const offsetX = Math.floor((targetW - fittedW) / 2);
  const offsetY = Math.floor((targetH - fittedH) / 2);

  for (let dy = 0; dy < fittedH; dy++) {
    const sy = Math.min(srcH - 1, Math.floor(dy / (fittedH / srcH)));
    const destY = offsetY + dy;
    if (destY < 0 || destY >= targetH) continue;

    for (let dx = 0; dx < fittedW; dx++) {
      const sx = Math.min(srcW - 1, Math.floor(dx / (fittedW / srcW)));
      const destX = offsetX + dx;
      if (destX < 0 || destX >= targetW) continue;

      const srcIdx = (sy * srcW + sx) * 4;
      const destIdx = (destY * targetW + destX) * 4;

      out[destIdx] = srcRgba[srcIdx];
      out[destIdx + 1] = srcRgba[srcIdx + 1];
      out[destIdx + 2] = srcRgba[srcIdx + 2];
      out[destIdx + 3] = srcRgba[srcIdx + 3];
    }
  }

  return { rgba: out, width: targetW, height: targetH };
}

/**
 * Generates an export pack format (Telegram, Discord, WhatsApp, Cricut)
 */
export function generateStickerExportPack(
  stickerRgba: Uint8ClampedArray,
  width: number,
  height: number,
  presetKey: string
) {
  const preset = STICKER_EXPORT_PRESETS[presetKey];
  if (!preset) throw new Error(`Unknown sticker export preset: ${presetKey}`);
  const resized = resizeRgbaBuffer(stickerRgba, width, height, preset.width, preset.height, 'contain');
  return {
    preset,
    width: resized.width,
    height: resized.height,
    rgba: resized.rgba,
  };
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'compositeSticker') {
        const { rgba, width, height, borderRadiusPx, featherPx, rimHex } = data;
        const result = compositeDieCutSticker(rgba, width, height, borderRadiusPx, featherPx, rimHex);
        (self as any).postMessage({ id, result }, [result.buffer]);
      } else if (action === 'exportPack') {
        const { stickerRgba, width, height, presetKey } = data;
        const result = generateStickerExportPack(stickerRgba, width, height, presetKey);
        (self as any).postMessage({ id, result }, [result.rgba.buffer]);
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}

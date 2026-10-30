/**
 * Biometric Photo Processing Worker
 * Handles 300 DPI JFIF injection, COM padding, and exact KB binary-search encoding.
 */

export interface LandmarkBox {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  chinY: number;
  crownY: number;
}

export interface BiometricSpec {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  minHeadRatio: number;
  maxHeadRatio: number;
  minEyeFromBottom: number;
  maxEyeFromBottom: number;
  backgroundHex: string;
  dpi: number;
  minFileSizeKB: number;
  maxFileSizeKB: number;
}

export function computeBiometricCrop(
  imgWidth: number,
  imgHeight: number,
  landmarks: LandmarkBox,
  spec: BiometricSpec
) {
  const dx = landmarks.rightEye.x - landmarks.leftEye.x;
  const dy = landmarks.rightEye.y - landmarks.leftEye.y;
  const rollAngleRad = Math.atan2(dy, dx);

  const eyeCenterX = (landmarks.leftEye.x + landmarks.rightEye.x) / 2;
  const eyeCenterY = (landmarks.leftEye.y + landmarks.rightEye.y) / 2;
  const rawHeadHeight = Math.abs(landmarks.chinY - landmarks.crownY);

  const targetHeadRatio = (spec.minHeadRatio + spec.maxHeadRatio) / 2;
  const targetEyeRatioFromBottom = (spec.minEyeFromBottom + spec.maxEyeFromBottom) / 2;
  const targetEyeRatioFromTop = 1.0 - targetEyeRatioFromBottom;

  const cropHeight = rawHeadHeight / targetHeadRatio;
  const cropWidth = cropHeight * (spec.widthPx / spec.heightPx);

  const cropTop = eyeCenterY - cropHeight * targetEyeRatioFromTop;
  const cropLeft = eyeCenterX - cropWidth / 2;

  return {
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    rollAngleRad,
    eyeCenterX,
    eyeCenterY,
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/**
 * Replaces or solidifies background to official consular colors (White #FFFFFF,
 * Light Gray #F3F4F6, Consular Blue #428BCA) using alpha mask or RGBA alpha.
 */
export function solidifyBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  backgroundHex: string = '#FFFFFF',
  alphaMask?: Uint8Array | Uint8ClampedArray
): Uint8ClampedArray {
  const { r: bgR, g: bgG, b: bgB } = hexToRgb(backgroundHex);
  const out = new Uint8ClampedArray(rgba.length);
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const fgA = alphaMask ? alphaMask[i] / 255 : rgba[idx + 3] / 255;
    const bgA = 1 - fgA;

    out[idx] = Math.round(rgba[idx] * fgA + bgR * bgA);
    out[idx + 1] = Math.round(rgba[idx + 1] * fgA + bgG * bgA);
    out[idx + 2] = Math.round(rgba[idx + 2] * fgA + bgB * bgA);
    out[idx + 3] = 255;
  }
  return out;
}

export interface BackgroundColorCluster {
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Samples the outer perimeter ring and groups background colors into up to `maxClusters`
 * dominant centroids using Leader-seeded K-Means refinement.
 * Handles multi-colored room backdrops (e.g., cream wall + brown bookshelf + green plant + curtain).
 */
export function clusterPerimeterBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxClusters: number = 8,
  includeBottomEdge: boolean = false
): BackgroundColorCluster[] {
  const samples: Array<[number, number, number]> = [];
  const borderDepth = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) * 0.05)));
  const sideLimit = includeBottomEdge ? height : Math.max(1, Math.floor(height * 0.82));

  // Sample top border strip
  for (let y = 0; y < borderDepth && y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (rgba[idx + 3] > 16) {
        samples.push([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
      }
    }
  }

  // Sample left & right border strips
  for (let y = borderDepth; y < sideLimit; y++) {
    for (let d = 0; d < borderDepth; d++) {
      const lx = d;
      const rx = width - 1 - d;
      if (lx < width) {
        const lIdx = (y * width + lx) * 4;
        if (rgba[lIdx + 3] > 16) {
          samples.push([rgba[lIdx], rgba[lIdx + 1], rgba[lIdx + 2]]);
        }
      }
      if (rx >= 0 && rx !== lx) {
        const rIdx = (y * width + rx) * 4;
        if (rgba[rIdx + 3] > 16) {
          samples.push([rgba[rIdx], rgba[rIdx + 1], rgba[rIdx + 2]]);
        }
      }
    }
  }

  // Sample bottom edge (full bottom for stickers, or outer 14% corners for portraits)
  const cornerSpan = Math.max(1, Math.floor(width * 0.14));
  for (let y = Math.max(borderDepth, height - borderDepth); y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!includeBottomEdge && x >= cornerSpan && x < width - cornerSpan) continue;
      const idx = (y * width + x) * 4;
      if (rgba[idx + 3] > 16) {
        samples.push([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
      }
    }
  }

  if (samples.length === 0) {
    return [{ r: 255, g: 255, b: 255, count: 1 }];
  }

  const clusters: BackgroundColorCluster[] = [];
  const mergeRadius = 26;

  for (let i = 0; i < samples.length; i++) {
    const [sr, sg, sb] = samples[i];
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      const cl = clusters[c];
      const dist = Math.hypot(sr - cl.r, sg - cl.g, sb - cl.b);
      if (dist < bestDist) {
        bestDist = dist;
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

  // 2-pass K-Means refinement for crisp cluster centroids
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
 * Computes a smooth foreground alpha matte (0 = background, 255 = foreground subject)
 * using Multi-Cluster Border Modeling, Spatial Portrait Saliency Priors,
 * Morphological Clutter Island Cleanup, and 2px Boundary Feathering.
 */
export function computePortraitAlphaMatte(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number = 38,
  externalConfidenceMask?: Uint8Array | Uint8ClampedArray | Float32Array
): Uint8ClampedArray {
  const total = width * height;
  const alphaMatte = new Uint8ClampedArray(total);
  alphaMatte.fill(255);
  if (width <= 0 || height <= 0 || rgba.length < total * 4) {
    return alphaMatte;
  }

  const bgClusters = clusterPerimeterBackground(rgba, width, height, 8, false);
  const primaryBg = bgClusters[0];

  const minBgDist = new Float32Array(total);
  const primaryBgDist = new Float32Array(total);
  const spatialCorePrior = new Float32Array(total);

  const headCenterX = width * 0.5;
  const headCenterY = height * 0.42;
  const headRadiusX = Math.max(2, width * 0.22);
  const headRadiusY = Math.max(2, height * 0.26);
  const torsoCenterY = height * 0.78;
  const torsoRadiusX = Math.max(3, width * 0.33);
  const torsoRadiusY = Math.max(3, height * 0.30);

  for (let y = 0; y < height; y++) {
    const dyHead = (y - headCenterY) / headRadiusY;
    const dyTorso = (y - torsoCenterY) / torsoRadiusY;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const idx = p * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      let bestD = Infinity;
      for (let c = 0; c < bgClusters.length; c++) {
        const cl = bgClusters[c];
        const d = Math.hypot(r - cl.r, g - cl.g, b - cl.b);
        if (d < bestD) bestD = d;
      }
      minBgDist[p] = bestD;
      primaryBgDist[p] = Math.hypot(r - primaryBg.r, g - primaryBg.g, b - primaryBg.b);

      const dxHead = (x - headCenterX) / headRadiusX;
      const rHead = Math.hypot(dxHead, dyHead);
      const dxTorso = (x - headCenterX) / torsoRadiusX;
      const rTorso = y >= headCenterY ? Math.hypot(dxTorso, dyTorso) : 99;
      const rNorm = Math.min(rHead, rTorso);

      // Inside rNorm <= 0.82 is high-confidence inner portrait core
      if (rNorm <= 0.82) {
        spatialCorePrior[p] = 1.0;
      } else if (rNorm <= 1.22) {
        spatialCorePrior[p] = 1.0 - (rNorm - 0.82) / 0.40;
      } else {
        spatialCorePrior[p] = 0.0;
      }
    }
  }

  // Multi-seeded 8-connected BFS flood-fill from perimeter
  const visited = new Uint8Array(total);
  const bgMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const canBeBackground = (p: number, prevP: number): boolean => {
    const core = spatialCorePrior[p];
    const dBg = minBgDist[p];

    // Deep inside portrait core: only allow background if it matches primary wall color tightly
    if (core >= 0.85) {
      return primaryBgDist[p] <= Math.min(16, tolerance * 0.42);
    }

    // Transition silhouette ring: require matching background cluster AND smooth gradient step
    if (core > 0.15) {
      const localTol = tolerance * (1.12 - 0.55 * core);
      if (dBg > localTol) return false;
      if (prevP >= 0) {
        const idx = p * 4;
        const pIdx = prevP * 4;
        const step = Math.hypot(
          rgba[idx] - rgba[pIdx],
          rgba[idx + 1] - rgba[pIdx + 1],
          rgba[idx + 2] - rgba[pIdx + 2]
        );
        // Stop at sharp subject silhouette edge if pixel color is distinct from primary wall
        if (step > tolerance * 0.85 && primaryBgDist[p] > tolerance * 0.75) {
          return false;
        }
      }
      return true;
    }

    // Outer background region: match any of the multi-cluster perimeter centroids
    if (dBg <= tolerance * 1.22) return true;
    if (prevP >= 0) {
      const idx = p * 4;
      const pIdx = prevP * 4;
      const step = Math.hypot(
        rgba[idx] - rgba[pIdx],
        rgba[idx + 1] - rgba[pIdx + 1],
        rgba[idx + 2] - rgba[pIdx + 2]
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
  }
  const sideLimit = Math.floor(height * 0.82);
  for (let y = 1; y < sideLimit; y++) {
    pushSeed(0, y);
    pushSeed(width - 1, y);
  }
  const cornerSpan = Math.max(1, Math.floor(width * 0.14));
  for (let x = 0; x < cornerSpan; x++) {
    pushSeed(x, height - 1);
    pushSeed(width - 1 - x, height - 1);
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

  // Morphological cleanup: absorb small isolated clutter pockets outside the portrait core
  const compVisited = new Uint8Array(total);
  const compQueue = new Int32Array(total);
  const maxClutterIslandArea = Math.max(6, Math.floor(total * 0.015));

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

  // Build smooth alpha matte with soft anti-aliased boundary feathering
  const featherRange = 20;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (bgMask[p] === 1) {
        alphaMatte[p] = 0;
      } else {
        // Check if adjacent to a background pixel
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
        if (touchesBg) {
          const dBg = minBgDist[p];
          if (dBg < tolerance + featherRange) {
            const fgWeight = Math.max(0.18, Math.min(1.0, (dBg - tolerance * 0.75) / (featherRange + tolerance * 0.25)));
            alphaMatte[p] = Math.round(fgWeight * 255);
          } else {
            alphaMatte[p] = 255;
          }
        } else {
          alphaMatte[p] = 255;
        }
      }

      // Blend with optional external neural segmenter mask (e.g. MediaPipe SelfieSegmenter in online mode)
      if (externalConfidenceMask && externalConfidenceMask.length === total) {
        const extVal = externalConfidenceMask[p];
        const extAlpha = extVal <= 1.0 && !(externalConfidenceMask instanceof Uint8Array || externalConfidenceMask instanceof Uint8ClampedArray)
          ? Math.round(Math.max(0, Math.min(1, extVal)) * 255)
          : Math.round(Math.max(0, Math.min(255, extVal)));
        alphaMatte[p] = Math.round(alphaMatte[p] * 0.35 + extAlpha * 0.65);
      }
    }
  }

  return alphaMatte;
}

/**
 * Multi-Cluster Saliency & Flood-Fill Portrait Background Remover with edge feathering.
 * Replaces studio or cluttered room backdrops around a portrait with official consular colors
 * (#FFFFFF Pure White, #F3F4F6 Light Gray, #428BCA Consular Blue).
 */
export function removePortraitBackgroundFloodFill(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number = 38,
  replacementHex: string = '#FFFFFF',
  externalConfidenceMask?: Uint8Array | Uint8ClampedArray | Float32Array
): Uint8ClampedArray {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return new Uint8ClampedArray(rgba);
  }
  const alphaMatte = computePortraitAlphaMatte(rgba, width, height, tolerance, externalConfidenceMask);
  return solidifyBackground(rgba, width, height, replacementHex, alphaMatte);
}

/**
 * Adaptive ink thresholding for handwritten signature strips (SSC, IBPS, UPSC, Visa forms).
 * Turns shadowed paper photos into crisp ink on pure white (#FFFFFF) or transparent background.
 */
export function extractCleanSignatureInk(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = 145,
  inkColorHex: string = '#0F172A',
  transparentBg: boolean = false
): Uint8ClampedArray {
  const { r: inkR, g: inkG, b: inkB } = hexToRgb(inkColorHex);
  const out = new Uint8ClampedArray(rgba.length);
  const total = width * height;
  const safeThreshold = Math.max(20, Math.min(245, threshold));

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const srcAlpha = rgba[idx + 3] / 255;
    const lum = (0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]) * srcAlpha + 255 * (1 - srcAlpha);

    if (lum >= safeThreshold) {
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
      out[idx + 3] = transparentBg ? 0 : 255;
    } else {
      const strength = Math.min(1, (safeThreshold - lum) / Math.max(24, safeThreshold * 0.42));
      if (transparentBg) {
        out[idx] = inkR;
        out[idx + 1] = inkG;
        out[idx + 2] = inkB;
        out[idx + 3] = Math.round(strength * 255);
      } else {
        out[idx] = Math.round(inkR * strength + 255 * (1 - strength));
        out[idx + 1] = Math.round(inkG * strength + 255 * (1 - strength));
        out[idx + 2] = Math.round(inkB * strength + 255 * (1 - strength));
        out[idx + 3] = 255;
      }
    }
  }
  return out;
}

export interface PrintSheetOptions {
  sheetWidth?: number;  // default 1800 (6" at 300 DPI)
  sheetHeight?: number; // default 1200 (4" at 300 DPI)
  photoCount: 4 | 6 | 8;
  cutlineHex?: string;  // default '#D1D5DB'
  marginPx?: number;
  gapPx?: number;
}

export interface PrintSheetSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintSheetResult {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  photoCount: number;
  cols: number;
  rows: number;
  slots: PrintSheetSlot[];
}

/**
 * Generates a 4x6" 300 DPI (1800x1200px) pharmacy printable sheet tiling 4, 6, or 8 photos
 * with 1px scissor cutlines (#D1D5DB) and pure white background.
 */
export function generatePrintSheet(
  photoRgba: Uint8ClampedArray,
  photoWidth: number,
  photoHeight: number,
  options: PrintSheetOptions
): PrintSheetResult {
  const sheetWidth = options.sheetWidth ?? 1800;
  const sheetHeight = options.sheetHeight ?? 1200;
  const photoCount = options.photoCount;
  const cutlineColor = hexToRgb(options.cutlineHex ?? '#D1D5DB');

  let cols = 2;
  let rows = 2;
  if (photoCount === 6) {
    cols = 3;
    rows = 2;
  } else if (photoCount === 8) {
    cols = 4;
    rows = 2;
  }

  const marginPx = options.marginPx ?? 30;
  const gapPx = options.gapPx ?? 20;

  const totalGapX = (cols - 1) * gapPx;
  const totalGapY = (rows - 1) * gapPx;
  const availW = sheetWidth - 2 * marginPx - totalGapX;
  const availH = sheetHeight - 2 * marginPx - totalGapY;

  const maxSlotW = Math.floor(availW / cols);
  const maxSlotH = Math.floor(availH / rows);

  const scale = Math.min(maxSlotW / photoWidth, maxSlotH / photoHeight);
  const targetW = Math.max(1, Math.round(photoWidth * scale));
  const targetH = Math.max(1, Math.round(photoHeight * scale));

  const sheetSize = sheetWidth * sheetHeight * 4;
  const sheetRgba = new Uint8ClampedArray(sheetSize);
  sheetRgba.fill(255); // Solid white #FFFFFF background

  const slots: PrintSheetSlot[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellOriginX = marginPx + c * (maxSlotW + gapPx);
      const cellOriginY = marginPx + r * (maxSlotH + gapPx);

      const slotX = cellOriginX + Math.floor((maxSlotW - targetW) / 2);
      const slotY = cellOriginY + Math.floor((maxSlotH - targetH) / 2);

      slots.push({ x: slotX, y: slotY, width: targetW, height: targetH });

      for (let py = 0; py < targetH; py++) {
        const srcY = Math.min(photoHeight - 1, Math.floor(py / scale));
        const dstY = slotY + py;
        if (dstY < 0 || dstY >= sheetHeight) continue;

        for (let px = 0; px < targetW; px++) {
          const srcX = Math.min(photoWidth - 1, Math.floor(px / scale));
          const dstX = slotX + px;
          if (dstX < 0 || dstX >= sheetWidth) continue;

          const srcIdx = (srcY * photoWidth + srcX) * 4;
          const dstIdx = (dstY * sheetWidth + dstX) * 4;

          const isPerimeter = (py === 0 || py === targetH - 1 || px === 0 || px === targetW - 1);
          if (isPerimeter) {
            sheetRgba[dstIdx] = cutlineColor.r;
            sheetRgba[dstIdx + 1] = cutlineColor.g;
            sheetRgba[dstIdx + 2] = cutlineColor.b;
            sheetRgba[dstIdx + 3] = 255;
          } else {
            const alpha = photoRgba[srcIdx + 3] / 255;
            sheetRgba[dstIdx] = Math.round(photoRgba[srcIdx] * alpha + 255 * (1 - alpha));
            sheetRgba[dstIdx + 1] = Math.round(photoRgba[srcIdx + 1] * alpha + 255 * (1 - alpha));
            sheetRgba[dstIdx + 2] = Math.round(photoRgba[srcIdx + 2] * alpha + 255 * (1 - alpha));
            sheetRgba[dstIdx + 3] = 255;
          }
        }
      }
    }
  }

  return {
    width: sheetWidth,
    height: sheetHeight,
    rgba: sheetRgba,
    photoCount,
    cols,
    rows,
    slots,
  };
}

/**
 * Patches the JFIF APP0 header in-place or splices a compliant 18-byte JFIF APP0
 * segment immediately after SOI (0xFFD8) if the encoder omitted APP0.
 */
export function injectJfifDpi(jpegBuffer: ArrayBuffer | Uint8Array, dpi: number = 300): Uint8Array {
  const src = jpegBuffer instanceof Uint8Array ? jpegBuffer : new Uint8Array(jpegBuffer);
  if (src.byteLength < 4 || src[0] !== 0xff || src[1] !== 0xd8) {
    return new Uint8Array(src);
  }

  const hi = (dpi >> 8) & 0xff;
  const lo = dpi & 0xff;

  // Case 1: Existing JFIF APP0 header at offset 2 -> patch in-place
  if (
    src.byteLength >= 18 &&
    src[2] === 0xff &&
    src[3] === 0xe0 &&
    src[6] === 0x4a && // 'J'
    src[7] === 0x46 && // 'F'
    src[8] === 0x49 && // 'I'
    src[9] === 0x46 && // 'F'
    src[10] === 0x00
  ) {
    const out = new Uint8Array(src);
    out[13] = 1;  // Density units: 1 = dots per inch (DPI)
    out[14] = hi; // Xdensity MSB
    out[15] = lo; // Xdensity LSB
    out[16] = hi; // Ydensity MSB
    out[17] = lo; // Ydensity LSB
    return out;
  }

  // Case 2: Encoder omitted JFIF APP0 -> splice compliant 18-byte APP0
  const app0Segment = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01,                   // Version 1.1
    0x01,                         // Units: 1 = DPI
    hi, lo,                       // Xdensity
    hi, lo,                       // Ydensity
    0x00, 0x00,                   // No thumbnail
  ]);
  const spliced = new Uint8Array(src.byteLength + app0Segment.byteLength);
  spliced.set(src.subarray(0, 2), 0);
  spliced.set(app0Segment, 2);
  spliced.set(src.subarray(2), 2 + app0Segment.byteLength);
  return spliced;
}

/**
 * Pads a JPEG buffer with spec-compliant JPEG COM (0xFFFE) segments before EOI (0xFFD9).
 */
export function padJpegToMinBytes(jpegBytes: Uint8Array, minBytes: number): Uint8Array {
  if (jpegBytes.byteLength >= minBytes || jpegBytes.byteLength < 4) return jpegBytes;
  const hasEoi =
    jpegBytes[jpegBytes.byteLength - 2] === 0xff &&
    jpegBytes[jpegBytes.byteLength - 1] === 0xd9;
  const insertPos = hasEoi ? jpegBytes.byteLength - 2 : jpegBytes.byteLength;

  let needed = minBytes - jpegBytes.byteLength;
  const chunks: Uint8Array[] = [];
  while (needed > 0) {
    const payloadLen = Math.max(1, Math.min(60000, needed - 4));
    const segLen = payloadLen + 2;
    const seg = new Uint8Array(2 + segLen);
    seg[0] = 0xff;
    seg[1] = 0xfe;
    seg[2] = (segLen >> 8) & 0xff;
    seg[3] = segLen & 0xff;
    seg.fill(0x20, 4); // ASCII space padding
    chunks.push(seg);
    needed -= seg.byteLength;
  }

  const totalPad = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(jpegBytes.byteLength + totalPad);
  out.set(jpegBytes.subarray(0, insertPos), 0);
  let offset = insertPos;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  if (hasEoi) {
    out.set(jpegBytes.subarray(insertPos), offset);
  } else {
    out[out.byteLength - 2] = 0xff;
    out[out.byteLength - 1] = 0xd9;
  }
  return out;
}

/**
 * Binary-searches JPEG encoding quality on OffscreenCanvas to land strictly
 * within [minKB, maxKB] (including JFIF APP0 overhead and COM floor padding).
 */
export async function encodeExactKilobytesJpeg(
  canvas: OffscreenCanvas,
  maxKB: number,
  dpi: number = 300,
  minKB: number = 0
): Promise<{ bytes: Uint8Array; quality: number; sizeKB: number }> {
  const maxBytes = Math.floor(maxKB * 1024);
  const minBytes = Math.ceil(minKB * 1024);
  let low = 0.12;
  let high = 0.98;
  let bestBytes: Uint8Array | null = null;
  let bestQuality = 0.92;

  for (let iter = 0; iter < 7; iter++) {
    const mid = (low + high) / 2;
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: mid });
    const candidate = injectJfifDpi(await blob.arrayBuffer(), dpi);

    if (candidate.byteLength <= maxBytes) {
      bestBytes = candidate;
      bestQuality = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  if (!bestBytes) {
    const fallbackBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.10 });
    bestBytes = injectJfifDpi(await fallbackBlob.arrayBuffer(), dpi);
    bestQuality = 0.10;
  }

  if (minBytes > 0 && bestBytes.byteLength < minBytes && minBytes < maxBytes) {
    const targetFloor = Math.min(maxBytes - 64, minBytes + 512);
    bestBytes = padJpegToMinBytes(bestBytes, targetFloor);
  }

  return {
    bytes: bestBytes,
    quality: Number(bestQuality.toFixed(3)),
    sizeKB: Number((bestBytes.byteLength / 1024).toFixed(2)),
  };
}

// Web Worker message listener when loaded in browser worker thread
if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', async (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'injectJfif') {
        const result = injectJfifDpi(data.buffer, data.dpi || 300);
        (self as any).postMessage({ id, result }, [result.buffer]);
      } else if (action === 'padJpeg') {
        const result = padJpegToMinBytes(data.bytes, data.minBytes);
        (self as any).postMessage({ id, result }, [result.buffer]);
      } else if (action === 'solidifyBackground') {
        const result = solidifyBackground(data.rgba, data.width, data.height, data.backgroundHex, data.alphaMask);
        (self as any).postMessage({ id, result }, [result.buffer]);
      } else if (action === 'generatePrintSheet') {
        const result = generatePrintSheet(data.photoRgba, data.photoWidth, data.photoHeight, data.options);
        (self as any).postMessage({ id, result }, [result.rgba.buffer]);
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}

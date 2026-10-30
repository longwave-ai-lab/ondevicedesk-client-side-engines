/**
 * 2K PNG Infographic Summary Exporter Worker
 * Generates crisp 2K (2560x1440 / 2048x1152) executive summary cards with Luxury Dark styling
 * (#090A0F, #F7B957 Amber Gold) entirely in client-side memory.
 */
import { zlibSync } from 'fflate';

export interface InfographicCardData {
  title: string;
  subtitle?: string;
  formulaName: string;
  primaryMetric: {
    label: string;
    value: string;
    subtext?: string;
  };
  secondaryMetrics: Array<{
    label: string;
    value: string;
    color?: string;
  }>;
  inputs: Array<{
    label: string;
    value: string;
  }>;
  chartComparison?: {
    labelA: string;
    valA: number;
    labelB: string;
    valB: number;
  };
}

export interface InfographicOptions {
  width?: number; // 2560 (2K QHD) or 2048 (16:9)
  height?: number; // 1440 or 1152
  theme?: 'editorial_paper' | 'luxury_dark' | 'amber_gold';
}

/**
 * Generates responsive 2K executive summary card SVG markup.
 * Supports 'editorial_paper' (Warm Tactile Paper & Editorial Ink) and 'luxury_dark'.
 */
export function generateInfographicSvg(
  data: InfographicCardData,
  options: InfographicOptions = {}
): string {
  const width = options.width || 2560;
  const height = options.height || 1440;
  const scaleX = Number((width / 2560).toFixed(4));
  const scaleY = Number((height / 1440).toFixed(4));
  const needsScale = width !== 2560 || height !== 1440;
  const isEditorial = options.theme === 'editorial_paper';

  const titleStr = String(data.title ?? '');
  const titleFontSize = titleStr.length > 62 ? 42 : titleStr.length > 48 ? 48 : 56;
  const hasChart = Boolean(data.chartComparison);
  const heroBoxWidth = hasChart ? 1480 : 2320;
  const heroValStr = String(data.primaryMetric.value ?? '');
  const heroValFontSize = heroValStr.length > 18 ? 64 : heroValStr.length > 14 ? 76 : heroValStr.length > 11 ? 90 : 104;
  const openScaleGroup = needsScale ? `<g transform="scale(${scaleX}, ${scaleY})">` : '';
  const closeScaleGroup = needsScale ? `</g>` : '';

  if (isEditorial) {
    const editorialSecondaries = data.secondaryMetrics.slice(0, 4).map((m, idx) => {
      const cardWidth = 556;
      const cardHeight = 168;
      const gap = 32;
      const x = 120 + idx * (cardWidth + gap);
      const y = 740;
      const valStr = String(m.value ?? '');
      const valFontSize = valStr.length > 18 ? 28 : valStr.length > 14 ? 34 : 44;

      return `
      <g transform="translate(${x}, ${y})">
        <rect width="${cardWidth}" height="${cardHeight}" rx="20" fill="#FAF8F5" stroke="#DDD6C7" stroke-width="2"/>
        <rect x="24" y="${cardHeight - 5}" width="${cardWidth - 48}" height="5" rx="2.5" fill="#F7B957"/>
        <text x="32" y="54" fill="#57534E" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="600">${escapeXml(m.label)}</text>
        <text x="32" y="122" fill="#1C1917" font-family="Georgia, 'Fraunces', serif" font-size="${valFontSize}" font-weight="700">${escapeXml(valStr)}</text>
      </g>
    `;
    }).join('');

    const editorialInputs = data.inputs.slice(0, 6).map((inp, idx) => {
      const chipWidth = 752;
      const chipHeight = 68;
      const gap = 32;
      const x = 120 + (idx % 3) * (chipWidth + gap);
      const y = 964 + Math.floor(idx / 3) * (chipHeight + 20);

      return `
      <g transform="translate(${x}, ${y})">
        <rect width="${chipWidth}" height="${chipHeight}" rx="14" fill="#F5F2EB" stroke="#DDD6C7" stroke-width="1.5"/>
        <text x="28" y="42" fill="#57534E" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="500">${escapeXml(inp.label)}</text>
        <text x="${chipWidth - 28}" y="42" fill="#1C1917" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="700" text-anchor="end">${escapeXml(inp.value)}</text>
      </g>
    `;
    }).join('');

    let editorialChartSvg = '';
    if (data.chartComparison) {
      const { labelA, valA, labelB, valB } = data.chartComparison;
      const safeValA = Number.isFinite(valA) ? valA : 0;
      const safeValB = Number.isFinite(valB) ? valB : 0;
      const maxVal = Math.max(1, Math.abs(safeValA), Math.abs(safeValB));
      const barWidthMax = 720;
      const widthA = Math.min(barWidthMax, Math.round((Math.max(0, safeValA) / maxVal) * barWidthMax));
      const widthB = Math.min(barWidthMax, Math.round((Math.max(0, safeValB) / maxVal) * barWidthMax));

      editorialChartSvg = `
      <g transform="translate(1640, 340)">
        <rect width="800" height="350" rx="24" fill="#FAF8F5" stroke="#DDD6C7" stroke-width="2"/>
        <text x="40" y="64" fill="#1C1917" font-family="Georgia, 'Fraunces', serif" font-size="28" font-weight="700">Revenue &amp; Cost Comparison</text>
        
        <!-- Bar A -->
        <text x="40" y="126" fill="#57534E" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="500">${escapeXml(labelA)}</text>
        <text x="760" y="126" fill="#B45309" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="700" text-anchor="end">${safeValA.toLocaleString()}</text>
        <rect x="40" y="144" width="720" height="32" rx="8" fill="#ECE7DC"/>
        <rect x="40" y="144" width="${Math.max(20, widthA)}" height="32" rx="8" fill="#D97706"/>

        <!-- Bar B -->
        <text x="40" y="238" fill="#57534E" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="500">${escapeXml(labelB)}</text>
        <text x="760" y="238" fill="#B91C1C" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="700" text-anchor="end">${safeValB.toLocaleString()}</text>
        <rect x="40" y="256" width="720" height="32" rx="8" fill="#ECE7DC"/>
        <rect x="40" y="256" width="${Math.max(20, widthB)}" height="32" rx="8" fill="#DC2626"/>
      </g>
    `;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="editorial-grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(120, 113, 108, 0.05)" stroke-width="1.2" />
    </pattern>
  </defs>

  <!-- Warm Tactile Paper Canvas -->
  <rect width="${width}" height="${height}" fill="#F5F2EB"/>
  <rect width="${width}" height="${height}" fill="url(#editorial-grid)"/>

  ${openScaleGroup}
  <!-- Inner Editorial Sheet Frame -->
  <rect x="60" y="60" width="2440" height="1320" rx="32" fill="#FFFDF9" stroke="#DDD6C7" stroke-width="2.5"/>
  <rect x="96" y="60" width="2368" height="6" rx="3" fill="#F7B957"/>

  <!-- Header Section -->
  <g transform="translate(120, 120)">
    <!-- Editorial Brand Badge -->
    <rect width="420" height="48" rx="14" fill="#F5F2EB" stroke="#DDD6C7" stroke-width="1.5"/>
    <circle cx="28" cy="24" r="7" fill="#D97706"/>
    <text x="48" y="31" fill="#44403C" font-family="Georgia, 'Fraunces', serif" font-size="19" font-weight="700">OnDevice Desk Financial Briefing</text>

    <!-- Private On-Device Badge -->
    <rect x="1980" y="0" width="340" height="48" rx="14" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.5"/>
    <circle cx="2008" cy="24" r="6" fill="#059669"/>
    <text x="2028" y="31" fill="#065F46" font-family="Inter, system-ui, sans-serif" font-size="17" font-weight="600">Private On-Device Calculation</text>

    <!-- Main Editorial Serif Title & Subtitle -->
    <text x="0" y="118" fill="#1C1917" font-family="Georgia, 'Fraunces', serif" font-size="${titleFontSize}" font-weight="700">${escapeXml(titleStr)}</text>
    <text x="0" y="166" fill="#57534E" font-family="Inter, system-ui, sans-serif" font-size="25" font-weight="400">${escapeXml(data.subtitle || data.formulaName)}</text>
  </g>

  <!-- Hero Primary Metric Box -->
  <g transform="translate(120, 340)">
    <rect width="${heroBoxWidth}" height="350" rx="24" fill="#FAF8F5" stroke="#DDD6C7" stroke-width="2"/>
    <rect x="32" y="344" width="${heroBoxWidth - 64}" height="6" rx="3" fill="#F7B957"/>
    
    <text x="56" y="84" fill="#57534E" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="600">${escapeXml(data.primaryMetric.label)}</text>
    <text x="56" y="206" fill="#1C1917" font-family="Georgia, 'Fraunces', serif" font-size="${heroValFontSize}" font-weight="700">${escapeXml(heroValStr)}</text>
    
    <text x="56" y="284" fill="#047857" font-family="Georgia, 'Fraunces', serif" font-style="italic" font-size="24" font-weight="500">
      ${escapeXml(data.primaryMetric.subtext || 'Calculated directly on your device')}
    </text>
  </g>

  <!-- Side Chart if provided -->
  ${editorialChartSvg}

  <!-- Secondary Metrics Grid -->
  ${editorialSecondaries}

  <!-- Input Parameters Badges -->
  <g transform="translate(0, 0)">
    ${editorialInputs}
  </g>

  <!-- Footer -->
  <g transform="translate(120, 1236)">
    <line x1="0" y1="0" x2="2320" y2="0" stroke="#DDD6C7" stroke-width="1.5"/>
    <text x="0" y="46" fill="#78716C" font-family="Georgia, 'Fraunces', serif" font-style="italic" font-size="19">Prepared with OnDevice Desk Financial Studio</text>
    <text x="2320" y="46" fill="#78716C" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="600" text-anchor="end">${width} × ${height} px High-Resolution Export</text>
  </g>
  ${closeScaleGroup}
</svg>`;
  }

  const secondaryCards = data.secondaryMetrics.slice(0, 4).map((m, idx) => {
    const cardWidth = 556;
    const cardHeight = 160;
    const gap = 32;
    const x = 120 + idx * (cardWidth + gap);
    const y = 750;
    const color = m.color || '#F7B957';
    const valStr = String(m.value ?? '');
    const valFontSize = valStr.length > 18 ? 28 : valStr.length > 14 ? 34 : 44;

    return `
      <g transform="translate(${x}, ${y})">
        <rect width="${cardWidth}" height="${cardHeight}" rx="20" fill="#12141C" stroke="rgba(247, 185, 87, 0.2)" stroke-width="2"/>
        <text x="32" y="54" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="500">${escapeXml(m.label)}</text>
        <text x="32" y="118" fill="${color}" font-family="Inter, system-ui, sans-serif" font-size="${valFontSize}" font-weight="700">${escapeXml(valStr)}</text>
      </g>
    `;
  }).join('');

  const inputChips = data.inputs.slice(0, 6).map((inp, idx) => {
    const chipWidth = 752;
    const chipHeight = 64;
    const gap = 32;
    const x = 120 + (idx % 3) * (chipWidth + gap);
    const y = 970 + Math.floor(idx / 3) * (chipHeight + 20);

    return `
      <g transform="translate(${x}, ${y})">
        <rect width="${chipWidth}" height="${chipHeight}" rx="12" fill="#181B26" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5"/>
        <text x="24" y="40" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="20">${escapeXml(inp.label)}</text>
        <text x="${chipWidth - 24}" y="40" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="600" text-anchor="end">${escapeXml(inp.value)}</text>
      </g>
    `;
  }).join('');

  // Comparison bar visual if available
  let chartSvg = '';
  if (data.chartComparison) {
    const { labelA, valA, labelB, valB } = data.chartComparison;
    const safeValA = Number.isFinite(valA) ? valA : 0;
    const safeValB = Number.isFinite(valB) ? valB : 0;
    const maxVal = Math.max(1, Math.abs(safeValA), Math.abs(safeValB));
    const barWidthMax = 720;
    const widthA = Math.min(barWidthMax, Math.round((Math.max(0, safeValA) / maxVal) * barWidthMax));
    const widthB = Math.min(barWidthMax, Math.round((Math.max(0, safeValB) / maxVal) * barWidthMax));

    chartSvg = `
      <g transform="translate(1640, 350)">
        <rect width="800" height="340" rx="28" fill="#12141C" stroke="rgba(247, 185, 87, 0.2)" stroke-width="2"/>
        <text x="40" y="64" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="700">Financial Balance Ratio</text>
        
        <!-- Bar A -->
        <text x="40" y="124" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="20">${escapeXml(labelA)}</text>
        <text x="760" y="124" fill="#F7B957" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" text-anchor="end">${safeValA.toLocaleString()}</text>
        <rect x="40" y="142" width="720" height="32" rx="8" fill="rgba(255, 255, 255, 0.06)"/>
        <rect x="40" y="142" width="${Math.max(20, widthA)}" height="32" rx="8" fill="#F7B957"/>

        <!-- Bar B -->
        <text x="40" y="234" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="20">${escapeXml(labelB)}</text>
        <text x="760" y="234" fill="#EF4444" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" text-anchor="end">${safeValB.toLocaleString()}</text>
        <rect x="40" y="252" width="720" height="32" rx="8" fill="rgba(255, 255, 255, 0.06)"/>
        <rect x="40" y="252" width="${Math.max(20, widthB)}" height="32" rx="8" fill="#EF4444"/>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <!-- Dark Galaxy Background Gradient -->
    <radialGradient id="bg-grad" cx="50%" cy="30%" r="80%" fx="50%" fy="20%">
      <stop offset="0%" stop-color="#181B26" />
      <stop offset="60%" stop-color="#0E1017" />
      <stop offset="100%" stop-color="#090A0F" />
    </radialGradient>

    <!-- Amber Gold Accent Gradient -->
    <linearGradient id="amber-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FCD34D" />
      <stop offset="100%" stop-color="#F7B957" />
    </linearGradient>

    <!-- Subtle Grid Pattern -->
    <pattern id="card-grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(247, 185, 87, 0.03)" stroke-width="1.5" />
    </pattern>
  </defs>

  <!-- Canvas Background -->
  <rect width="${width}" height="${height}" fill="url(#bg-grad)"/>
  <rect width="${width}" height="${height}" fill="url(#card-grid)"/>

  ${openScaleGroup}
  <!-- Master Card Frame -->
  <rect x="60" y="60" width="2440" height="1320" rx="36" fill="none" stroke="rgba(247, 185, 87, 0.3)" stroke-width="3"/>

  <!-- Header Section -->
  <g transform="translate(120, 120)">
    <!-- Brand / Security Badge -->
    <rect width="440" height="48" rx="24" fill="rgba(247, 185, 87, 0.12)" stroke="rgba(247, 185, 87, 0.4)" stroke-width="1.5"/>
    <circle cx="28" cy="24" r="8" fill="#F7B957"/>
    <text x="48" y="32" fill="#F7B957" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="1">OnDevice Desk | Executive Summary</text>

    <!-- Verified Airplane-Mode Badge -->
    <rect x="2040" y="0" width="280" height="48" rx="24" fill="rgba(16, 185, 129, 0.12)" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1.5"/>
    <circle cx="2064" cy="24" r="6" fill="#10B981"/>
    <text x="2084" y="31" fill="#10B981" font-family="Inter, system-ui, sans-serif" font-size="16" font-weight="600">100% PRIVATE OFFLINE</text>

    <!-- Main Title & Formula Tag -->
    <text x="0" y="120" fill="#FFFFFF" font-family="Inter, system-ui, sans-serif" font-size="${titleFontSize}" font-weight="800">${escapeXml(data.title)}</text>
    <text x="0" y="168" fill="#9CA3AF" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="400">${escapeXml(data.subtitle || data.formulaName)}</text>
  </g>

  <!-- Hero Primary Metric Box -->
  <g transform="translate(120, 350)">
    <rect width="${heroBoxWidth}" height="340" rx="28" fill="#12141C" stroke="rgba(247, 185, 87, 0.35)" stroke-width="2.5"/>
    
    <text x="64" y="88" fill="#D1D5DB" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="600">${escapeXml(data.primaryMetric.label)}</text>
    <text x="64" y="205" fill="url(#amber-grad)" font-family="Inter, system-ui, sans-serif" font-size="${heroValFontSize}" font-weight="900" letter-spacing="-2">${escapeXml(heroValStr)}</text>
    
    <text x="64" y="280" fill="#10B981" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="500">
      ${escapeXml(data.primaryMetric.subtext || 'Calculated using real-time client-side formula evaluation')}
    </text>
  </g>

  <!-- Side Chart if provided -->
  ${chartSvg}

  <!-- Secondary Metrics Grid -->
  ${secondaryCards}

  <!-- Input Parameters Badges -->
  <g transform="translate(0, 0)">
    ${inputChips}
  </g>

  <!-- Footer Watermark & Timestamp -->
  <g transform="translate(120, 1240)">
    <line x1="0" y1="0" x2="2320" y2="0" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5"/>
    <text x="0" y="44" fill="#6B7280" font-family="Inter, system-ui, sans-serif" font-size="18">Generated completely offline via OnDevice Desk Studio | Zero Server Cost | 2K Resolution</text>
    <text x="2320" y="44" fill="#6B7280" font-family="Inter, system-ui, sans-serif" font-size="18" text-anchor="end">${width} x ${height} px | 300 DPI Ready</text>
  </g>
  ${closeScaleGroup}
</svg>`;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Standard CRC32 algorithm for compliant PNG chunk generation.
 */
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Generates an uncompressed/deflated binary PNG buffer directly from RGBA pixels.
 */
export function encodeRgbaToPng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  // Create scanlines with filter byte 0 (None) at the start of each row
  const scanlines = new Uint8Array(height * (1 + width * 4));
  let srcPos = 0;
  let dstPos = 0;

  for (let y = 0; y < height; y++) {
    scanlines[dstPos++] = 0; // Filter byte: 0
    for (let x = 0; x < width * 4; x++) {
      scanlines[dstPos++] = rgba[srcPos++];
    }
  }

  // Compress scanlines with standard zlib (RFC 1950) for compliant PNG IDAT
  const idatCompressed = zlibSync(scanlines);

  // Helper to build a PNG chunk: [length(4), type(4), data(N), crc(4)]
  function makeChunk(typeStr: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);

    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) {
      chunk[4 + i] = typeStr.charCodeAt(i);
    }
    chunk.set(data, 8);

    const crcVal = crc32(chunk.subarray(4, 8 + data.length));
    view.setUint32(8 + data.length, crcVal);
    return chunk;
  }

  // PNG Signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk: width(4), height(4), bitDepth(1)=8, colorType(1)=6 (RGBA), comp(1)=0, filter(1)=0, interlace(1)=0
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idat = makeChunk('IDAT', idatCompressed);

  // IEND Chunk
  const iend = makeChunk('IEND', new Uint8Array(0));

  // Assemble full PNG
  const totalLength = signature.length + ihdr.length + idat.length + iend.length;
  const pngBytes = new Uint8Array(totalLength);
  let offset = 0;

  pngBytes.set(signature, offset);
  offset += signature.length;
  pngBytes.set(ihdr, offset);
  offset += ihdr.length;
  pngBytes.set(idat, offset);
  offset += idat.length;
  pngBytes.set(iend, offset);

  return pngBytes;
}

const BITMAP_FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  'D': [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  'M': [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
  'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  'S': [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  'Y': [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '$': [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '%': [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04],
  ',': [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x08],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '|': [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  ':': [0x00, 0x04, 0x00, 0x00, 0x04, 0x00, 0x00],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
};

function drawPixelRect(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  const x0 = Math.max(0, Math.min(width, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height, Math.floor(y)));
  const x1 = Math.max(0, Math.min(width, Math.floor(x + w)));
  const y1 = Math.max(0, Math.min(height, Math.floor(y + h)));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = (py * width + px) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
}

function strokePixelRect(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  lineWidth: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  drawPixelRect(rgba, width, height, x, y, w, lineWidth, r, g, b, a);
  drawPixelRect(rgba, width, height, x, y + h - lineWidth, w, lineWidth, r, g, b, a);
  drawPixelRect(rgba, width, height, x, y, lineWidth, h, r, g, b, a);
  drawPixelRect(rgba, width, height, x + w - lineWidth, y, lineWidth, h, r, g, b, a);
}

function drawBitmapText(
  rgba: Uint8Array,
  width: number,
  height: number,
  text: string,
  startX: number,
  startY: number,
  scale: number,
  r: number,
  g: number,
  b: number,
  a = 255
): void {
  let currX = startX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const rows = BITMAP_FONT[ch] || BITMAP_FONT[' '];
    for (let row = 0; row < 7; row++) {
      const bits = rows[row];
      for (let col = 0; col < 5; col++) {
        if ((bits >> (4 - col)) & 1) {
          drawPixelRect(rgba, width, height, currX + col * scale, startY + row * scale, scale, scale, r, g, b, a);
        }
      }
    }
    currX += 6 * scale;
  }
}

/**
 * Renders executive summary data to 2K RGBA pixels and encodes into clean 2K PNG bytes.
 */
export async function generateInfographicPng(
  data: InfographicCardData,
  options: InfographicOptions = {}
): Promise<Uint8Array> {
  const width = options.width || 2560;
  const height = options.height || 1440;

  // In real browser context with OffscreenCanvas/Canvas:
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw Luxury Dark Background
        ctx.fillStyle = '#090A0F';
        ctx.fillRect(0, 0, width, height);

        // Header outer frame
        ctx.strokeStyle = '#F7B957';
        ctx.lineWidth = 3;
        ctx.strokeRect(60, 60, width - 120, height - 120);

        // Brand Badge
        ctx.fillStyle = 'rgba(247, 185, 87, 0.12)';
        ctx.strokeStyle = 'rgba(247, 185, 87, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(120, 140, 360, 48);
        ctx.strokeRect(120, 140, 360, 48);

        ctx.fillStyle = '#F7B957';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('OnDevice Desk | Executive Summary', 140, 170);

        // Title & subtitle
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 56px sans-serif';
        ctx.fillText(data.title, 120, 270);
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '28px sans-serif';
        ctx.fillText(data.subtitle || data.formulaName, 120, 320);

        // Primary Hero Box
        ctx.fillStyle = '#12141C';
        ctx.strokeStyle = '#F7B957';
        ctx.lineWidth = 2.5;
        ctx.fillRect(120, 440, 1440, 340);
        ctx.strokeRect(120, 440, 1440, 340);

        ctx.fillStyle = '#D1D5DB';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(data.primaryMetric.label, 180, 530);

        ctx.fillStyle = '#F7B957';
        ctx.font = 'bold 96px sans-serif';
        ctx.fillText(data.primaryMetric.value, 180, 640);

        ctx.fillStyle = '#10B981';
        ctx.font = '24px sans-serif';
        ctx.fillText(data.primaryMetric.subtext || 'Calculated offline via client-side formula evaluation', 180, 710);

        // Secondary Metrics Grid
        const secondary = data.secondaryMetrics.slice(0, 4);
        secondary.forEach((m, idx) => {
          const cardW = 556;
          const cardH = 160;
          const x = 120 + idx * (cardW + 32);
          const y = 750;
          ctx.fillStyle = '#12141C';
          ctx.strokeStyle = 'rgba(247, 185, 87, 0.2)';
          ctx.lineWidth = 2;
          ctx.fillRect(x, y, cardW, cardH);
          ctx.strokeRect(x, y, cardW, cardH);

          ctx.fillStyle = '#9CA3AF';
          ctx.font = '22px sans-serif';
          ctx.fillText(m.label, x + 32, y + 54);

          ctx.fillStyle = m.color || '#F7B957';
          ctx.font = 'bold 40px sans-serif';
          ctx.fillText(m.value, x + 32, y + 118);
        });

        // Input Parameter Chips
        const inputs = data.inputs.slice(0, 6);
        inputs.forEach((inp, idx) => {
          const chipW = 752;
          const chipH = 64;
          const x = 120 + (idx % 3) * (chipW + 32);
          const y = 970 + Math.floor(idx / 3) * (chipH + 20);
          ctx.fillStyle = '#181B26';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1.5;
          ctx.fillRect(x, y, chipW, chipH);
          ctx.strokeRect(x, y, chipW, chipH);

          ctx.fillStyle = '#9CA3AF';
          ctx.font = '20px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(inp.label, x + 24, y + 40);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(inp.value, x + chipW - 24, y + 40);
          ctx.textAlign = 'left';
        });

        // Return blob
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const buf = await blob.arrayBuffer();
        return new Uint8Array(buf);
      }
    } catch {
      // Fall back to pure RGBA encoder
    }
  }

  // Pure software RGBA rasterization for Node/headless test environments
  const rgba = new Uint8Array(width * height * 4);

  // 1. Fill Luxury Dark Background #090A0F (R=9, G=10, B=15, A=255)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    rgba[idx] = 9;
    rgba[idx + 1] = 10;
    rgba[idx + 2] = 15;
    rgba[idx + 3] = 255;
  }

  // 2. Paint 4-sided Outer Gold Frame (#F7B957: 247, 185, 87)
  strokePixelRect(rgba, width, height, 60, 60, width - 120, height - 120, 3, 247, 185, 87, 255);

  // 3. Brand Badge
  drawPixelRect(rgba, width, height, 120, 140, 480, 48, 24, 27, 38, 255);
  strokePixelRect(rgba, width, height, 120, 140, 480, 48, 1, 247, 185, 87, 180);
  drawBitmapText(rgba, width, height, 'ONDEVICE DESK | EXECUTIVE SUMMARY', 140, 154, 2, 247, 185, 87, 255);

  // 4. Card Title and Subtitle
  drawBitmapText(rgba, width, height, data.title, 120, 230, 4, 255, 255, 255, 255);
  drawBitmapText(rgba, width, height, data.subtitle || data.formulaName, 120, 280, 2, 156, 163, 175, 255);

  // 5. Primary Hero Box
  drawPixelRect(rgba, width, height, 120, 360, 1440, 400, 18, 20, 28, 255);
  strokePixelRect(rgba, width, height, 120, 360, 1440, 400, 2, 247, 185, 87, 200);
  drawBitmapText(rgba, width, height, data.primaryMetric.label, 160, 400, 3, 209, 213, 219, 255);
  drawBitmapText(rgba, width, height, data.primaryMetric.value, 160, 460, 8, 247, 185, 87, 255);
  drawBitmapText(rgba, width, height, data.primaryMetric.subtext || 'Calculated offline via client-side formula evaluation', 160, 680, 2, 16, 185, 129, 255);

  // 6. Secondary Metric Cards
  const secondary = data.secondaryMetrics.slice(0, 4);
  secondary.forEach((m, idx) => {
    const cardW = 420;
    const cardH = 160;
    const x = 120 + idx * (cardW + 25);
    const y = 800;
    drawPixelRect(rgba, width, height, x, y, cardW, cardH, 18, 20, 28, 255);
    strokePixelRect(rgba, width, height, x, y, cardW, cardH, 2, 247, 185, 87, 100);
    drawBitmapText(rgba, width, height, m.label, x + 20, y + 30, 2, 156, 163, 175, 255);
    drawBitmapText(rgba, width, height, m.value, x + 20, y + 80, 4, 247, 185, 87, 255);
  });

  // 7. Input Parameter Chips
  const inputs = data.inputs.slice(0, 6);
  inputs.forEach((inp, idx) => {
    const chipW = 520;
    const chipH = 55;
    const chipX = 120 + (idx % 3) * (chipW + 25);
    const chipY = 1000 + Math.floor(idx / 3) * (chipH + 20);
    drawPixelRect(rgba, width, height, chipX, chipY, chipW, chipH, 24, 27, 38, 255);
    drawBitmapText(rgba, width, height, inp.label, chipX + 15, chipY + 20, 2, 156, 163, 175, 255);
    drawBitmapText(rgba, width, height, inp.value, chipX + 360, chipY + 20, 2, 255, 255, 255, 255);
  });

  // 8. Financial Balance Ratio Chart (if present)
  if (data.chartComparison) {
    const cx = 1620;
    const cy = 360;
    const cw = 820;
    const ch = 400;
    drawPixelRect(rgba, width, height, cx, cy, cw, ch, 18, 20, 28, 255);
    strokePixelRect(rgba, width, height, cx, cy, cw, ch, 2, 247, 185, 87, 100);
    drawBitmapText(rgba, width, height, 'FINANCIAL BALANCE RATIO', cx + 40, cy + 40, 3, 255, 255, 255, 255);
    drawBitmapText(rgba, width, height, data.chartComparison.labelA, cx + 40, cy + 110, 2, 156, 163, 175, 255);
    drawPixelRect(rgba, width, height, cx + 40, cy + 140, Math.min(600, Math.max(30, Math.round(data.chartComparison.valA / 100))), 30, 247, 185, 87, 255);
    drawBitmapText(rgba, width, height, data.chartComparison.labelB, cx + 40, cy + 220, 2, 156, 163, 175, 255);
    drawPixelRect(rgba, width, height, cx + 40, cy + 250, Math.min(600, Math.max(30, Math.round(data.chartComparison.valB / 100))), 30, 239, 68, 68, 255);
  }

  return encodeRgbaToPng(rgba, width, height);
}

/**
 * Top-level convenience export for calculator UI integration.
 */
export async function renderInfographicCard(
  data: InfographicCardData,
  options: InfographicOptions = {}
): Promise<{ svg: string; pngBytes: Uint8Array; width: number; height: number }> {
  const width = options.width || 2560;
  const height = options.height || 1440;
  const svg = generateInfographicSvg(data, { width, height });
  const pngBytes = await generateInfographicPng(data, { width, height });

  return { svg, pngBytes, width, height };
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', async (e: MessageEvent) => {
    const { action, id, data } = e.data || {};
    try {
      if (action === 'renderInfographic') {
        const { cardData, options } = data;
        const result = await renderInfographicCard(cardData, options);
        (self as any).postMessage({ id, result }, [result.pngBytes.buffer]);
      }
    } catch (err: any) {
      (self as any).postMessage({ id, error: err?.message || String(err) });
    }
  });
}

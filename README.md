# OnDevice Desk: Zero-Upload Client-Side Browser Utility Engines

> **100% Client-Side WebAssembly & Canvas Reference Architecture** powering **[OnDevice Desk](https://ondevicedesk.com)** across 4 specialized browser studios (**1,850+ programmatic tool presets** with **0 bytes uploaded** to any server).

[![Live Studio](https://img.shields.io/badge/Live_Studio-ondevicedesk.com-F7B957?style=for-the-badge&labelColor=1C1917)](https://ondevicedesk.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-10B981?style=for-the-badge&labelColor=1C1917)](./LICENSE)
[![Privacy](https://img.shields.io/badge/Cloud_Uploads-0_Bytes-38BDF8?style=for-the-badge&labelColor=1C1917)](https://ondevicedesk.com/llms.txt)

---

## Live Browser Studios (100% Free & Local)

| Studio | Live URL | Core Client-Side Engine | Key Output |
| :--- | :--- | :--- | :--- |
| **1. Passport & Biometric ID Studio** | **[id.ondevicedesk.com](https://id.ondevicedesk.com/)** | Binary APP0 `300 DPI` JFIF injector + 7-step binary search JPEG KB encoder + COM segment padding | Official US (`2×2 in`), Schengen (`35×45 mm`), UK & Vietnam (`4×6 cm`) photos + `$0.39` `4×6"` print sheets |
| **2. Die-Cut Sticker & EXIF Cleaner** | **[sticker.ondevicedesk.com](https://sticker.ondevicedesk.com/)** | Felzenszwalb & Huttenlocher $O(W \times H)$ separable 1D parabolic Euclidean Distance Transform (EDT) | Smooth vinyl die-cut outlines (`4px–36px`), kiss-cut rims, Telegram/Discord packs & Batch ZIP EXIF stripper |
| **3. Private PDF Redactor & CSV Vault** | **[pdf.ondevicedesk.com](https://pdf.ondevicedesk.com/)** | Split-span kerning PII clusterer (`±2.5pt`) + destructive `300 DPI` bitmap burn-in & stream deletion | Irreversible PDF blackout (0 underlying text tokens) + offline bank statement to CSV/Excel converter |
| **4. Business & 2K Calc Studio** | **[calc.ondevicedesk.com](https://calc.ondevicedesk.com/)** | 64-iteration monotonic bisection reverse goal solver (`±0.001` precision) + RFC 1950 zlib 2K PNG encoder | SaaS runway, e-commerce margin & freelance tax modeling + `2560×1440` (2K) summary cards |

---

## Why Client-Side Browser Utilities Beat Cloud Converters

Most online "free" passport photo makers, PDF redactors, and bank statement converters upload your sensitive files to remote cloud servers. Worse, many browser PDF tools merely draw a black `<rect>` annotation over confidential text without removing the underlying PDF content stream, meaning anyone can press `Ctrl+F` or copy-paste the hidden Social Security Number or account number underneath.

**OnDevice Desk** solves both problems by executing every byte of image, PDF, and financial math inside local browser memory (`Web Workers`, `OffscreenCanvas`, and typed arrays):

### 1. Exact `300 DPI` JFIF Header Calibration & Portal KB Bounds (`id.ondevicedesk.com`)
HTML5 `canvas.toBlob('image/jpeg')` defaults to `72 DPI` or `96 DPI` in the JFIF `APP0` segment (`0xFFE0`), causing automated government embassy portals (such as US State Department DS-160) to reject otherwise valid photos.
- **Mechanism**: Our encoder splices `densityUnits = 1` (`dots per inch`) and `Xdensity = 300, Ydensity = 300` (`[0x01, 0x01, 0x2C, 0x01, 0x2C]`) directly into the JPEG byte stream, then executes a 7-step binary search over quality factors combined with compliant `0xFFFE` COM segment padding to land strictly inside portal kilobyte windows (e.g., `54 KB – 240 KB`).
- **Try it live**: [US Passport & DS-160 Visa Tool](https://id.ondevicedesk.com/us-passport-photo-tool) · [Schengen Visa Photo Tool](https://id.ondevicedesk.com/de-visa-photo-tool) · [Canada Passport Photo Tool](https://id.ondevicedesk.com/ca-passport-photo-tool) · [Vietnam Passport & CCCD Tool](https://id.ondevicedesk.com/vn-passport-photo-tool)

### 2. Linear-Time $O(W \times H)$ Euclidean Distance Transform for Die-Cut Stickers (`sticker.ondevicedesk.com`)
Naive morphological dilation with a circular kernel of radius $R$ scales as $O(W \times H \times R^2)$, freezing the browser UI on high-resolution PNGs.
- **Mechanism**: We implement Felzenszwalb & Huttenlocher's separable lower-envelope parabolic distance transform in two 1D passes (horizontal + vertical), computing exact Euclidean distances across millions of pixels in linear $O(W \times H)$ time independent of border thickness $R$.
- **Try it live**: [Custom Die-Cut Sticker Maker](https://sticker.ondevicedesk.com/) · [Telegram 512×512 Sticker Tool](https://sticker.ondevicedesk.com/telegram-die-cut-vinyl-standard-512-tool)

### 3. Destructive `300 DPI` PDF Redaction & Split-Span PII Clustering (`pdf.ondevicedesk.com`)
PDF generators frequently split a single SSN or credit card number across multiple `Tj` / `TJ` text operators due to kerning adjustments.
- **Mechanism**: Our parser reconstructs horizontal lines within a `±2.5pt` vertical baseline tolerance before running PII regexes, strips matching text tokens directly from the PDF content streams, and burns solid blackout rectangles so zero underlying text survives.
- **Try it live**: [Private PDF Redactor & Statement Converter](https://pdf.ondevicedesk.com/) · [Bank Statement to CSV Extractor](https://pdf.ondevicedesk.com/banking-finance-bank-statement-tabular-bank-csv-extract-vault-tool)

### 4. Bidirectional Reverse Goal Solver & 2K Summary Cards (`calc.ondevicedesk.com`)
Instead of forcing founders and freelancers to guess inputs by trial and error, every formula supports reverse goal-seeking.
- **Mechanism**: A 64-step monotonic bisection solver (`±0.001` convergence) solves backward for the exact MRR, retail price, or billable rate needed to reach your target runway or take-home income, then renders a `2560×1440` (2K) presentation card locally.
- **Try it live**: [Business & Freelance Financial Calculators](https://calc.ondevicedesk.com/) · [E-Commerce Gross Margin Calculator](https://calc.ondevicedesk.com/ecommerce-dtc-gross-margin-cogs-usd-tier1-markets-calc-tool)

---

## Open-Core Source Code Map (`src/`)

All client-side algorithmic workers and WebAssembly / OPFS runtime bridges are published in TypeScript under `src/`:

| Module Path | Architectural Responsibility |
| :--- | :--- |
| [`src/engines/biometric-photo.worker.ts`](./src/engines/biometric-photo.worker.ts) | Binary `APP0` (`0xFFE0`) `300 DPI` JFIF header injector, 8-connected perimeter flood-fill background replacement, and 7-step binary search JPEG kilobyte targeting (`0xFFFE` COM padding). |
| [`src/engines/diecut-sticker.worker.ts`](./src/engines/diecut-sticker.worker.ts) | Separable 1D lower-envelope parabolic Euclidean Distance Transform ($O(W \times H)$) for smooth die-cut vinyl borders and kiss-cut paths. |
| [`src/engines/exif-sanitizer.worker.ts`](./src/engines/exif-sanitizer.worker.ts) | Binary `APP1` EXIF/GPS/XMP segment stripper for JPEG and PNG (`tEXt`/`iTXt`/`eXIf`) with in-memory `fflate` batch ZIP export. |
| [`src/engines/pdf-redact.worker.ts`](./src/engines/pdf-redact.worker.ts) | PDF 1.x content-stream tokenizer, split-span kerning PII clusterer (`±2.5pt`), and destructive `300 DPI` pixel-burn redaction. |
| [`src/engines/bank-statement.worker.ts`](./src/engines/bank-statement.worker.ts) | Spatial column reconstruction from PDF text spans into structured CSV / Excel financial ledger rows. |
| [`src/engines/calc-engine.worker.ts`](./src/engines/calc-engine.worker.ts) | Deterministic SaaS, e-commerce, and freelance financial formulas with 64-iteration monotonic bisection reverse goal-seeking (`±0.001`). |
| [`src/engines/infographic.worker.ts`](./src/engines/infographic.worker.ts) | Client-side `2560×1440` (2K) financial summary card renderer and RFC 1950 zlib PNG binary encoder. |
| [`src/engines/whisper-subtitle.worker.ts`](./src/engines/whisper-subtitle.worker.ts) | Local WebAssembly audio framing and subtitle timestamp generator (`SRT` / `VTT`). |
| [`src/runtime/`](./src/runtime/index.ts) | `Cross-Origin-Embedder-Policy` (`COEP`) capability detector, WebAssembly SIMD feature probe, Origin Private File System (`OPFS`) model cache, and Web Worker pool manager. |

---

## Machine-Readable AI & RAG Documentation (`llms.txt` & Sitemaps)

- **Master Cross-Subdomain Sitemap Index (1,850 Routes)**: [https://ondevicedesk.com/sitemap-index.xml](https://ondevicedesk.com/sitemap-index.xml) · [PWA Web Manifest](https://ondevicedesk.com/manifest.webmanifest)
- **Primary Studio Index**: [https://ondevicedesk.com/llms.txt](https://ondevicedesk.com/llms.txt) · [Full Reference](https://ondevicedesk.com/llms-full.txt)
- **Biometric ID Studio**: [https://id.ondevicedesk.com/llms.txt](https://id.ondevicedesk.com/llms.txt) · [Sitemap (500 Routes)](https://id.ondevicedesk.com/sitemap.xml)
- **Sticker & Media Studio**: [https://sticker.ondevicedesk.com/llms.txt](https://sticker.ondevicedesk.com/llms.txt) · [Sitemap (450 Routes)](https://sticker.ondevicedesk.com/sitemap.xml)
- **PDF Privacy Vault**: [https://pdf.ondevicedesk.com/llms.txt](https://pdf.ondevicedesk.com/llms.txt) · [Sitemap (450 Routes)](https://pdf.ondevicedesk.com/sitemap.xml)
- **Business Calc Studio**: [https://calc.ondevicedesk.com/llms.txt](https://calc.ondevicedesk.com/llms.txt) · [Sitemap (450 Routes)](https://calc.ondevicedesk.com/sitemap.xml)

---

## License

MIT License. Created and maintained by **[Longwave AI Lab](https://github.com/longwave-ai-lab)**.

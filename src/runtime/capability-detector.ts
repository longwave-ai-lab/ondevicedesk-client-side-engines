export interface SystemCapabilities {
  hasWebGPU: boolean;
  hasWasmSimd: boolean;
  hasOpfs: boolean;
  hardwareConcurrency: number;
}

/**
 * Detects whether WebGPU is supported and available in the browser.
 */
export async function detectWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    if (typeof gpu.requestAdapter === 'function') {
      const adapter = await gpu.requestAdapter();
      return !!adapter;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects whether 128-bit WebAssembly Fixed-Width SIMD is supported by validating bytecode.
 * Uses the canonical Google Chrome Labs wasm-feature-detect binary.
 */
export function detectSimd128(): boolean {
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') {
    return false;
  }
  try {
    // 128-bit SIMD test binary from GoogleChromeLabs/wasm-feature-detect
    const simdTest = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
    ]);
    return WebAssembly.validate(simdTest);
  } catch {
    return false;
  }
}

/**
 * Detects whether Origin Private File System (OPFS) is supported.
 */
export async function detectOpfs(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return false;
  }
  try {
    const root = await navigator.storage.getDirectory();
    return !!root;
  } catch {
    return false;
  }
}

/**
 * Aggregates all client-side hardware and runtime capabilities.
 */
export async function detectCapabilities(): Promise<SystemCapabilities> {
  const [hasWebGPU, hasOpfs] = await Promise.all([detectWebGPU(), detectOpfs()]);
  const hasWasmSimd = detectSimd128();
  const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  return {
    hasWebGPU,
    hasWasmSimd,
    hasOpfs,
    hardwareConcurrency,
  };
}

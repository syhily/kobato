// Shared SEA binary-size budget, enforced at build time and re-verified by
// the smoke — catches a regression to uncompressed blob embedding
// (linux node26 base + payload ≈ 194 MB).
export const BINARY_MAX_BYTES = 230 * 1024 * 1024

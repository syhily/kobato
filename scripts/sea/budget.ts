// Shared SEA binary-size budget, enforced at build time (scripts/sea/
// build.ts) and re-verified by the smoke (scripts/sea/smoke.ts).
//
// The blob is the binary's variable part: uncompressed it is ~173 MB
// (libduckdb alone is ~112 MB raw), the compressed payload must stay in
// the ~45-55 MB band. A regression to uncompressed embedding roughly
// triples the binary — fail loudly here rather than at release time.
// `--build-sea` builds the blob into the binary internally, so the
// regression is caught by a binary-size budget (linux node26 base
// ~148 MB + ~46 MB payload ≈ 194 MB).
export const BINARY_MAX_BYTES = 230 * 1024 * 1024

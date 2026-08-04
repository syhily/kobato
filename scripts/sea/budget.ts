// Shared SEA binary-size budgets, enforced at build time (scripts/sea/
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

// Frontend line (SEA_TARGET=frontend): the public SSR service carries no
// native libraries, so its payload is tiny (server bundle + client
// assets — a few MB compressed). The node26 executable base alone is
// ~148 MB, so a whole-binary budget must sit above that: 180 MB leaves
// ~32 MB of payload headroom — a blob-packing regression (e.g. a client
// tree that stops compressing, or an accidental native inclusion) blows
// through it while a healthy build lands ~155-165 MB.
export const FRONTEND_BINARY_MAX_BYTES = 180 * 1024 * 1024

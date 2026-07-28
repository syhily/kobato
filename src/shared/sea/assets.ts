// Single owner of the SEA embedded-asset key contract: the writer is
// `scripts/sea/assets.ts`, the readers under `src/server/` fetch assets
// back by key through `getEmbeddedAsset` / `listEmbeddedAssetKeys`
// (`@/server/infra/sea`). Never hardcode an asset key outside this module.
//
// Asset key layout:
//   manifest.json                       this build's manifest
//   client/<path>                       whole build/client tree (static assets)
//   drizzle/<folder>/<file>             whole drizzle/ tree (migrations)
//   wasm/cnfs.wasm                      the cn-font-split wasm core
//   worker/process-worker.mjs           bundled image worker (text)
//   worker/smoke-worker.mjs             bundled --smoke-worker entry (text)
//   natives/<file>                      native dynamic libraries (sharp.node,
//                                       skia.node, duckdb.node, libvips*,
//                                       libduckdb*) — the only assets
//                                       extracted to disk at runtime
//   natives-meta/<file>.json            platform-package metadata the
//                                       redirected native requires answer
//                                       from memory (never extracted)
//
// The server bundle (server.mjs) is NOT an asset: it is the injected
// `main` of the binary (`mainFormat: "module"` — see scripts/sea/blob.ts).
//
// Isomorphic: constants only — no imports, no runtime code.

/**
 * Key of the build manifest asset: `{ version, target, files }` describing
 * every embedded file (the manifest does not list itself).
 */
export const SEA_MANIFEST_KEY = 'manifest.json'

/**
 * Compression codec of an embedded asset, recorded per file in the
 * manifest's `codec` field. Every asset above 1 KB is compressed at build
 * time (see `scripts/sea/assets.ts`) and decoded lazily on read (see
 * `@/server/infra/sea`). `'none'` means the blob holds the raw bytes —
 * tiny assets, and always the manifest itself: it doubles as the
 * decompression registry, so it must be readable before anything else.
 * A missing `codec` field (binaries built before compression) is treated
 * as `'none'`.
 */
export type SeaAssetCodec = 'zstd' | 'brotli' | 'none'

/** Key of the bundled image worker, embedded as text and started via `new Worker(code, { eval: true, execArgv: ['--input-type=module'] })`. */
export const SEA_PROCESS_WORKER_BUNDLE_KEY = 'worker/process-worker.mjs'

/** Key of the bundled `--smoke-worker` entry, embedded as text and dispatched via `new Worker(code, { eval: true, execArgv: ['--input-type=module'] })`. */
export const SEA_SMOKE_WORKER_BUNDLE_KEY = 'worker/smoke-worker.mjs'

/** Key of the cn-font-split wasm core, instantiated from memory. */
export const SEA_WASM_CNFS_KEY = 'wasm/cnfs.wasm'

/** Prefix of the whole `build/client` tree (fingerprinted static assets + public files). */
export const SEA_CLIENT_ASSET_PREFIX = 'client/'

/** Prefix of the whole `drizzle/` tree (migration.sql files + snapshots). */
export const SEA_DRIZZLE_ASSET_PREFIX = 'drizzle/'

/**
 * Prefix of the native dynamic libraries — the ONLY assets extracted to
 * disk at runtime (the OS `dlopen` needs real files). Exactly the
 * platform's sharp addon, the skia (canvas) addon, the DuckDB addon +
 * libduckdb library, and the libvips library files ride under it; all
 * package JS is bundled into the server/worker bundles instead (see
 * `scripts/sea/assets.ts`). The extraction path is the key with this
 * prefix stripped — the natives cache dir is flat.
 */
export const SEA_NATIVE_ASSET_PREFIX = 'natives/'

/** Key of the platform sharp addon (`@img/sharp-<platform>`'s `*.node`, rpath-patched at build time). */
export const SEA_NATIVE_SHARP_ADDON_KEY = 'natives/sharp.node'

/** Key of the platform skia addon (`@napi-rs/canvas-<triple>`'s `skia.*.node`). */
export const SEA_NATIVE_SKIA_ADDON_KEY = 'natives/skia.node'

/** Key of the platform DuckDB addon (`@duckdb/node-bindings-<platform>`'s `duckdb.node`, rpath-patched at build time). */
export const SEA_NATIVE_DUCKDB_ADDON_KEY = 'natives/duckdb.node'

/**
 * Key of the embedded `@img/sharp-libvips-<platform>/versions` answer
 * (the package's versions.json). Absent on platforms without a separate
 * libvips package (win32) — the redirected probe then throws and sharp
 * falls back the way it does upstream.
 */
export const SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY = 'natives-meta/libvips-versions.json'

/** Key of the embedded `@img/sharp-libvips-<platform>/package` answer (the package's package.json). */
export const SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY = 'natives-meta/libvips-package.json'

/** Key of the embedded `@img/sharp-<platform>/package` answer (the platform package's package.json). */
export const SEA_NATIVE_META_SHARP_PACKAGE_KEY = 'natives-meta/sharp-platform-package.json'

/**
 * Key of the embedded `@img/sharp-<platform>/versions` answer. Only
 * win32 platform packages ship a versions.json (they bundle libvips);
 * elsewhere the key is absent and the probe throws into sharp's own
 * try/catch, exactly like the upstream MODULE_NOT_FOUND.
 */
export const SEA_NATIVE_META_SHARP_VERSIONS_KEY = 'natives-meta/sharp-platform-versions.json'

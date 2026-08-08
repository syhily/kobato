// Single owner of the SEA embedded-asset key contract: writer
// `scripts/sea/assets.ts`, readers `src/server/infra/sea`. Never
// hardcode an asset key outside this module. server.mjs is NOT an
// asset — it is the injected binary `main`. Isomorphic: constants only.

/**
 * Key of the build manifest asset (`{ version, target, files }`); the
 * manifest does not list itself.
 */
export const SEA_MANIFEST_KEY = 'manifest.json'

/** Codec of an embedded asset, recorded in the manifest per file. 'none' = raw bytes — tiny assets, and always the manifest itself (it must be readable first); missing codec = 'none'. */
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
 * disk at runtime (dlopen needs real files). Extraction path is the key
 * with this prefix stripped: the natives cache dir is flat.
 */
export const SEA_NATIVE_ASSET_PREFIX = 'natives/'

/** Key of the platform sharp addon (`@img/sharp-<platform>`'s `*.node`, rpath-patched at build time). */
export const SEA_NATIVE_SHARP_ADDON_KEY = 'natives/sharp.node'

/** Key of the platform skia addon (`@napi-rs/canvas-<triple>`'s `skia.*.node`). */
export const SEA_NATIVE_SKIA_ADDON_KEY = 'natives/skia.node'

/**
 * Win32-only: skia probes for its ICU datafile next to the loaded
 * module; a missing file is FATAL on the first paragraph build. Absent
 * on darwin/linux (ICU is built in).
 */
export const SEA_NATIVE_SKIA_ICU_KEY = 'natives/icudtl.dat'

/** Key of the platform DuckDB addon (`@duckdb/node-bindings-<platform>`'s `duckdb.node`, rpath-patched at build time). */
export const SEA_NATIVE_DUCKDB_ADDON_KEY = 'natives/duckdb.node'

/**
 * Key of the embedded `@img/sharp-libvips-<platform>/versions` answer.
 * Absent on win32 (no separate libvips package) — the redirected probe
 * then throws and sharp falls back upstream-style.
 */
export const SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY = 'natives-meta/libvips-versions.json'

/** Key of the embedded `@img/sharp-libvips-<platform>/package` answer (the package's package.json). */
export const SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY = 'natives-meta/libvips-package.json'

/** Key of the embedded `@img/sharp-<platform>/package` answer (the platform package's package.json). */
export const SEA_NATIVE_META_SHARP_PACKAGE_KEY = 'natives-meta/sharp-platform-package.json'

/**
 * Key of the embedded `@img/sharp-<platform>/versions` answer.
 * Win32-only: other platforms ship no versions.json, and the probe
 * throws into sharp's own try/catch (upstream MODULE_NOT_FOUND path).
 */
export const SEA_NATIVE_META_SHARP_VERSIONS_KEY = 'natives-meta/sharp-platform-versions.json'

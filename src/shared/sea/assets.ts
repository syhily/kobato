// Single owner of the SEA embedded-asset key contract. The SEA binary
// embeds every runtime resource into the blob; the writer is
// `scripts/sea/assets.ts` (via `node --experimental-sea-config`) and the
// readers under `src/server/` fetch assets back by key through
// `getEmbeddedAsset` / `listEmbeddedAssetKeys` (`@/server/infra/sea`).
// Keeping the keys here makes drift between writer and readers impossible
// by construction — renaming a key is one edit that every side picks up.
// Never hardcode an asset key outside this module.
//
// Asset key layout:
//   manifest.json                    this build's manifest
//   server/server.mjs                single-file ESM server bundle
//   client/<path>                    whole build/client tree (static assets)
//   drizzle/<folder>/<file>          whole drizzle/ tree (migrations)
//   wasm/cnfs.wasm                   the cn-font-split wasm core
//   worker/process-worker.cjs        tsdown-emitted image worker (text)
//   worker/smoke-worker.cjs          tsdown-emitted --smoke-worker entry
//   node_modules/<pkg>/<file>        native packages, extracted at first run
//
// Isomorphic: constants only — no imports, no runtime code.

/**
 * Key of the build manifest asset: `{ version, target, files }` describing
 * every embedded file (the manifest does not list itself).
 */
export const SEA_MANIFEST_KEY = 'manifest.json'

/** Key of the single-file ESM server bundle, materialized next to the natives dir and imported from there. */
export const SEA_SERVER_BUNDLE_KEY = 'server/server.mjs'

/** Key of the tsdown-emitted image worker, embedded as text and started via `new Worker(code, { eval: true })`. */
export const SEA_PROCESS_WORKER_BUNDLE_KEY = 'worker/process-worker.cjs'

/** Key of the tsdown-emitted `--smoke-worker` entry, materialized on demand by the prelude. */
export const SEA_SMOKE_WORKER_BUNDLE_KEY = 'worker/smoke-worker.cjs'

/** Key of the cn-font-split wasm core, instantiated from memory. */
export const SEA_WASM_CNFS_KEY = 'wasm/cnfs.wasm'

/** Prefix of the whole `build/client` tree (fingerprinted static assets + public files). */
export const SEA_CLIENT_ASSET_PREFIX = 'client/'

/** Prefix of the whole `drizzle/` tree (migration.sql files + snapshots). */
export const SEA_DRIZZLE_ASSET_PREFIX = 'drizzle/'

/** Prefix of the native packages (flat node_modules tree) — the only assets extracted to disk at runtime. */
export const SEA_NATIVE_ASSET_PREFIX = 'node_modules/'

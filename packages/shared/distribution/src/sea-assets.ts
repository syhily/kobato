export const SEA_MANIFEST_KEY = 'manifest.json'

export type SeaAssetCodec = 'zstd' | 'none'

export const SEA_PROCESS_WORKER_BUNDLE_KEY = 'worker/process-worker.mjs'

export const SEA_SMOKE_WORKER_BUNDLE_KEY = 'worker/smoke-worker.mjs'

export const SEA_WASM_CNFS_KEY = 'wasm/cnfs.wasm'

export const SEA_CLIENT_ASSET_PREFIX = 'client/'

export const SEA_DRIZZLE_ASSET_PREFIX = 'drizzle/'

export const SEA_NATIVE_ASSET_PREFIX = 'natives/'

export const SEA_NATIVE_SHARP_ADDON_KEY = 'natives/sharp.node'

export const SEA_NATIVE_SKIA_ADDON_KEY = 'natives/skia.node'

export const SEA_NATIVE_SKIA_ICU_KEY = 'natives/icudtl.dat'

export const SEA_NATIVE_DUCKDB_ADDON_KEY = 'natives/duckdb.node'

export const SEA_OBSERVABILITY_ASSET_PREFIX = 'observability/'

export const SEA_OBSERVABILITY_RUM_PRIVACY_VRL_KEY = 'observability/rum-privacy.vrl'

export const SEA_OBSERVABILITY_DASHBOARD_PREFIX = 'observability/dashboards/'

export const OBSERVABILITY_DASHBOARD_FILES = [
  'browser.json',
  'correlation.json',
  'overview.json',
  'server.json',
] as const

export const SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY = 'natives-meta/libvips-versions.json'

export const SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY = 'natives-meta/libvips-package.json'

export const SEA_NATIVE_META_SHARP_PACKAGE_KEY = 'natives-meta/sharp-platform-package.json'

export const SEA_NATIVE_META_SHARP_VERSIONS_KEY = 'natives-meta/sharp-platform-versions.json'

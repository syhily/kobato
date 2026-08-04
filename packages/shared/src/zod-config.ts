/**
 * Pre-configure Zod before any schema is imported.
 *
 * Zod v4 probes `eval` support at init time with `new Function("")`. Under a
 * strict CSP (`script-src 'self' 'nonce-...'`) this triggers a
 * `securitypolicyviolation` event even though the throw is swallowed.
 * Setting `jitless: true` skips the probe entirely.
 */
;(globalThis as Record<string, unknown>).__zod_globalConfig = { jitless: true }

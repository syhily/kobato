/** Pre-configure Zod before any schema is imported: `jitless: true` skips the `new Function("")` eval probe — under a strict CSP it fires a `securitypolicyviolation` event even though the throw is swallowed. */
;(globalThis as Record<string, unknown>).__zod_globalConfig = { jitless: true }

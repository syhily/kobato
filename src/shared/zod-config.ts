/** Pre-configure Zod before any schema is imported, browser only: `jitless: true` skips the `new Function("")` eval probe — under a strict CSP it fires a `securitypolicyviolation` event even though the throw is swallowed. The server has no CSP, so it keeps JIT enabled and additionally auto-compiles schemas via `import 'zod/compile'` in the server entries (`src/entry.server.tsx`, `scripts/sea/server-entry.ts`) — global compile mode stands down wherever `jitless` is set. */
if (typeof window !== 'undefined') {
  ;(globalThis as Record<string, unknown>).__zod_globalConfig = { jitless: true }
}

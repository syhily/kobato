// Placeholder for the built server graph that `server-entry.ts` imports.
// The real module is `build/server/index.js`, produced by `pnpm run build`;
// a fresh checkout (CI typecheck) has no `build/`, and TS errors TS2882 on
// the side-effect import. File resolution wins when the build output
// exists, so this declaration is only the fresh-checkout fallback. The
// wildcard is needed because TS bans relative ambient module names.
declare module '*/build/server/index.js'

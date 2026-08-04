// Placeholders for the built server graphs that the SEA entry shims
// import. The real modules are `apps/{core,public}/build/server/index.js`,
// produced by `pnpm run build`; a fresh checkout (CI typecheck) has no
// `build/`, and TS errors TS2882 on the side-effect imports. File
// resolution wins when the build output exists, so this declaration is
// only the fresh-checkout fallback. The wildcard is needed because TS
// bans relative ambient module names.
declare module '*/apps/core/build/server/index.js'
declare module '*/apps/public/build/server/index.js'

// Bundler plugin: redirect the native packages' platform requires.
//
// sharp, @napi-rs/canvas, and @duckdb/node-api are statically imported
// by the server/worker graphs and inlined into the SEA bundles
// (`ssr.noExternal: true`). Their own platform loading must NOT resolve
// at bundle time — the `.node` addons and libvips metadata live outside
// the bundle (the flat natives cache dir + embedded `natives-meta/*`
// assets). This plugin rewrites the platform-specifier `require(...)`
// call sites inside those packages' modules to `nativeRequire(...)`,
// whose runtime resolution lives in `@/server/infra/native-require`:
//
//   require("@img/sharp-darwin-x64/sharp.node")     → nativeRequire(...)
//   require(`@img/sharp-libvips-${p}/versions`)     → nativeRequire(...)
//   require(`../src/build/Release/sharp-....node`)  → nativeRequire(...)  (throws; sharp's try/catch absorbs it)
//   require('@napi-rs/canvas-darwin-x64')           → nativeRequire(...)
//   require('./skia.darwin-x64.node')               → nativeRequire(...)  (throws; canvas's try/catch absorbs it)
//   require('@duckdb/node-bindings-darwin-x64/duckdb.node')  → nativeRequire(...)
//
// Every other require (node builtins, `semver`, `detect-libc`,
// `@img/colour`, relative JS imports, …) is left for the bundler to
// resolve and inline normally.
//
// The rewrite is a text-level call-site RENAME, not an AST transform: the
// replaced argument text is re-emitted verbatim, so literal and
// template-literal arguments (including ones with nested `()` like
// `` `@img/sharp-libvips-dev-${buildPlatformArch()}/include` ``) survive
// intact. The call sites this covers are enumerated and pinned by the
// `native-specifiers` contract test — a future sharp/canvas release that
// adds a new platform specifier fails that test at upgrade time.
//
// Plain plugin shape (`name` + `transform` only) — no Vite-only hooks, so
// the plugin works from a bare rolldown config too.

import type { Plugin } from 'vite'

const NATIVE_REQUIRE_BINDING = 'nativeRequire'
const NATIVE_REQUIRE_MODULE = '@/server/infra/native-require'

/**
 * Modules this plugin transforms: any file inside the sharp,
 * @napi-rs/canvas, or @duckdb/node-bindings package directories (pnpm
 * store or flat node_modules — both layouts contain a
 * `/node_modules/<pkg>/` segment). Platform packages (`@img/*`,
 * `@napi-rs/canvas-*`, `@duckdb/node-bindings-*`) never enter the module
 * graph — their only references were rewritten away — so they need no
 * scope.
 */
const SCOPED_MODULE =
  /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:sharp|@napi-rs[\\/]canvas|@duckdb[\\/]node-bindings)[\\/]/

/**
 * Arguments that mark a platform-specifier require: `@img/sharp…` (the
 * sharp platform addon + the libvips packages' metadata probes — NOT
 * `@img/colour`, a pure-JS dependency the bundler inlines normally),
 * `@napi-rs/canvas-…` (skia platform packages),
 * `@duckdb/node-bindings-…` (DuckDB platform packages), `.node`
 * (relative addon attempts), `src/build` (sharp's build-from-source
 * fallback), `skia.wasi.cjs` (canvas's bundled-wasm fallback — rewritten
 * so the bundler never tries to resolve the nonexistent file;
 * nativeRequire throws and canvas's try/catch walks on).
 */
const PLATFORM_SPECIFIER_MARKERS = [
  '@img/sharp',
  '@napi-rs/canvas-',
  '@duckdb/node-bindings-',
  '.node',
  'src/build',
  'skia.wasi.cjs',
]

/** Matches `require(<arg>)` call sites whose argument contains a platform marker. */
const PLATFORM_REQUIRE =
  /(?<![\w$.])require\(([^)]*(?:@img\/sharp|@napi-rs\/canvas-|@duckdb\/node-bindings-|\.node|src\/build|skia\.wasi\.cjs)[^)]*)\)/g

/** Whether a module id belongs to one of the native packages. Exported for the contract test. */
export function isNativePackageModule(id: string): boolean {
  return SCOPED_MODULE.test(id)
}

/** Whether a `require(...)` argument is a platform specifier this plugin redirects. Exported for the contract test. */
export function isPlatformSpecifierArg(arg: string): boolean {
  return PLATFORM_SPECIFIER_MARKERS.some((marker) => arg.includes(marker))
}

/**
 * Rewrite the platform require call sites in one module's source. Returns
 * null when nothing matched (the common case — most modules have no
 * platform requires).
 */
export function redirectNativeRequires(code: string, id: string): string | null {
  if (!isNativePackageModule(id)) {
    return null
  }
  const rewritten = code.replace(PLATFORM_REQUIRE, `${NATIVE_REQUIRE_BINDING}($1)`)
  if (rewritten === code) {
    return null
  }
  // The renamed call sites need the binding in scope. `.mjs` sources are
  // ESM (sharp's dist); everything else in the scoped packages is CJS
  // (canvas, sharp's .cjs flavor) and gets the require form — the
  // bundler's CJS interop resolves it like any other require.
  const binding = id.endsWith('.mjs')
    ? `import { ${NATIVE_REQUIRE_BINDING} } from '${NATIVE_REQUIRE_MODULE}';\n`
    : `const { ${NATIVE_REQUIRE_BINDING} } = require('${NATIVE_REQUIRE_MODULE}');\n`
  return `${binding}${rewritten}`
}

export function redirectNativeRequiresPlugin(): Plugin {
  return {
    name: 'redirect-native-requires',
    // Run before the bundler's own module handling so the renamed call
    // sites are never resolved (the platform packages and .node files are
    // not meant to enter the graph at all).
    enforce: 'pre',
    transform(code, id) {
      const rewritten = redirectNativeRequires(code, id)
      if (rewritten === null) {
        return null
      }
      return { code: rewritten, map: null }
    },
  }
}

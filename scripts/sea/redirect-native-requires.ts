// Bundler plugin: rename the native packages' platform-specifier requires
// to `nativeRequire(...)` (`@/server/infra/native-require`) — their `.node`
// and libvips loads must not resolve at bundle time (flat natives cache +
// embedded `natives-meta/*` assets). The rewrite is text-level and verbatim
// (template-literal args survive); the covered specifiers are pinned by the
// `native-specifiers` contract test.

import type { Plugin } from 'vite'

const NATIVE_REQUIRE_BINDING = 'nativeRequire'
const NATIVE_REQUIRE_MODULE = '@/server/infra/native-require'

/**
 * Modules to transform: files inside the sharp / @napi-rs/canvas /
 * @duckdb/node-bindings package dirs (pnpm-store and flat layouts both
 * contain a `/node_modules/<pkg>/` segment). Platform packages never enter
 * the module graph — their only references were rewritten away.
 */
const SCOPED_MODULE =
  /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:sharp|@napi-rs[\\/]canvas|@duckdb[\\/]node-bindings)[\\/]/

/**
 * Arguments that mark a platform-specifier require: the `@img/*` / canvas /
 * duckdb platform specifiers, plus the relative `.node` / `src/build` /
 * `skia.wasi.cjs` fallbacks (NOT `@img/colour` — pure JS, inlined normally).
 */
const PLATFORM_SPECIFIER_MARKERS = [
  '@img/sharp',
  '@napi-rs/canvas-',
  '@duckdb/node-bindings-',
  '.node',
  'src/build',
  'skia.wasi.cjs',
]

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
 * Rewrite the platform require call sites in one module's source; null when
 * nothing matched (the common case).
 */
export function redirectNativeRequires(code: string, id: string): string | null {
  if (!isNativePackageModule(id)) {
    return null
  }
  const rewritten = code.replace(PLATFORM_REQUIRE, `${NATIVE_REQUIRE_BINDING}($1)`)
  if (rewritten === code) {
    return null
  }
  // `.mjs` sources are ESM (sharp's dist); everything else in scope is CJS —
  // each gets its matching binding form (the bundler's interop resolves it).
  const binding = id.endsWith('.mjs')
    ? `import { ${NATIVE_REQUIRE_BINDING} } from '${NATIVE_REQUIRE_MODULE}';\n`
    : `const { ${NATIVE_REQUIRE_BINDING} } = require('${NATIVE_REQUIRE_MODULE}');\n`
  return `${binding}${rewritten}`
}

export function redirectNativeRequiresPlugin(): Plugin {
  return {
    name: 'redirect-native-requires',
    // Run before module resolution so the renamed sites are never resolved.
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

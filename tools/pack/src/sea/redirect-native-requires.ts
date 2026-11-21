import type { Plugin } from 'vite'

const NATIVE_REQUIRE_BINDING = 'nativeRequire'
const NATIVE_REQUIRE_MODULE = '@kobato/server/infra/sea/native-require'

const SCOPED_MODULE =
  /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:sharp|@napi-rs[\\/]canvas|@duckdb[\\/]node-bindings)[\\/]/

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

export function isNativePackageModule(id: string): boolean {
  return SCOPED_MODULE.test(id)
}

export function isPlatformSpecifierArg(arg: string): boolean {
  return PLATFORM_SPECIFIER_MARKERS.some((marker) => arg.includes(marker))
}

export function redirectNativeRequires(code: string, id: string): string | null {
  if (!isNativePackageModule(id)) {
    return null
  }
  const rewritten = code.replace(PLATFORM_REQUIRE, `${NATIVE_REQUIRE_BINDING}($1)`)
  if (rewritten === code) {
    return null
  }
  const binding = id.endsWith('.mjs')
    ? `import { ${NATIVE_REQUIRE_BINDING} } from '${NATIVE_REQUIRE_MODULE}';\n`
    : `const { ${NATIVE_REQUIRE_BINDING} } = require('${NATIVE_REQUIRE_MODULE}');\n`
  return `${binding}${rewritten}`
}

export function redirectNativeRequiresPlugin(): Plugin {
  return {
    name: 'redirect-native-requires',
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

import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  isNativePackageModule,
  isPlatformSpecifierArg,
  redirectNativeRequires,
} from '../../../../scripts/sea/redirect-native-requires.ts'

// Contract test: the platform require call sites inside the INSTALLED
// sharp / sharp-ico / @napi-rs/canvas packages must stay exactly the set
// the SEA redirect machinery knows about. A future sharp/canvas release
// that adds a new platform specifier shape fails HERE at upgrade time —
// not at `sea:smoke` or in production. Two halves:
//
//   1. enumerate every `require(...)` call site carrying a platform
//      marker in the packages' dist files and classify its shape —
//      answered (nativeRequire resolves it), probe (throws into the
//      package's own try/catch, which is also upstream's outcome), or
//      UNKNOWN (test failure);
//   2. prove the bundler plugin actually rewrites every one of those
//      call sites (a shape the plugin misses would drag a `.node` /
//      platform package resolution into the bundle and break the build).

// The argument pattern allows ONE balanced nested paren pair so template
// interpolations with calls — `` `@img/sharp-libvips-dev-${buildPlatformArch()}/include` ``
// — are captured whole (the plugin's own rename re-emits them verbatim;
// this enumeration must see the full specifier to classify it).
const NATIVE_REQUIRE_REGEX =
  /(?<![\w$.])require\(((?:[^()]|\([^()]*\))*?(?:@img\/sharp|@napi-rs\/canvas-|\.node|src\/build|skia\.wasi\.cjs)(?:[^()]|\([^()]*\))*?)\)/g

/** Real path of an installed package root (exports maps hide package.json on some). */
function packageRoot(name: string): string {
  try {
    return realpathSync(join(process.cwd(), 'node_modules', name))
  } catch {
    throw new Error(`${name} is not installed — run pnpm install first`)
  }
}

/** `dist/*.mjs` + `dist/*.cjs` of a package (both flavors — the bundler may pick either). */
function distFiles(root: string): string[] {
  return readdirSync(join(root, 'dist'))
    .filter((name) => name.endsWith('.mjs') || name.endsWith('.cjs'))
    .map((name) => join(root, 'dist', name))
}

/** Extract every platform require argument from one source file. */
function platformRequireArgs(source: string): string[] {
  return [...source.matchAll(NATIVE_REQUIRE_REGEX)].map((match) => match[1]!)
}

/** Normalize an argument: strip the surrounding quotes/backticks and collapse `${...}` to `<T>`. */
function normalizeArg(arg: string): string {
  return arg
    .trim()
    .replace(/^[`'"]|[`'"]$/g, '')
    .replace(/\$\{[^}]*\}/g, '<T>')
}

type SpecifierClass = 'answered' | 'probe' | 'unknown'

/**
 * Classify one normalized specifier.
 *
 *   answered — nativeRequire resolves it (addon loads, metadata probes);
 *              the non-current platforms' instances simply never execute.
 *   probe    — nativeRequire throws and the package's own try/catch
 *              absorbs it: build-from-source fallbacks, wasm candidates,
 *              libvips-dev headers, and the platform package's /versions
 *              probe (absent upstream too — sharp falls back to the
 *              libvips versions).
 */
function classify(spec: string): SpecifierClass {
  // Addon loads (answered for the current platform's instance).
  if (/^@img\/sharp-(?!libvips)[^/]+\/sharp\.node$/.test(spec)) {
    return 'answered'
  }
  if (/^@napi-rs\/canvas-(?!wasm32)[^/]+$/.test(spec)) {
    return 'answered'
  }
  // Metadata probes nativeRequire answers from the embedded assets.
  if (/^@img\/sharp-libvips-[^/]+\/(versions|package|lib)$/.test(spec)) {
    return 'answered'
  }
  if (/^@img\/sharp-(?!libvips)[^/]+\/package$/.test(spec)) {
    return 'answered'
  }
  // The platform package's versions probe: throws on platforms without a
  // versions.json (upstream MODULE_NOT_FOUND too); answered on win32.
  if (/^@img\/sharp-(?!libvips)[^/]+\/versions$/.test(spec)) {
    return 'probe'
  }
  // Build-from-source fallbacks, relative addon attempts, wasm candidates,
  // libvips-dev headers — thrown and absorbed by the packages' try/catch.
  if (
    spec.includes('src/build') ||
    spec.startsWith('./skia') ||
    spec.startsWith('@img/sharp-libvips-dev') ||
    spec.includes('wasm32')
  ) {
    return 'probe'
  }
  return 'unknown'
}

interface CallSite {
  file: string
  arg: string
  normalized: string
  klass: SpecifierClass
}

function enumerateCallSites(): CallSite[] {
  const files = [
    ...distFiles(packageRoot('sharp')),
    ...['index.js', 'js-binding.js', 'geometry.js', 'load-image.js', 'node-canvas.js'].map((name) =>
      join(packageRoot('@napi-rs/canvas'), name),
    ),
    join(packageRoot('sharp-ico'), 'index.js'),
  ]
  const sites: CallSite[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf-8')
    for (const arg of platformRequireArgs(source)) {
      const normalized = normalizeArg(arg)
      sites.push({ file, arg, normalized, klass: classify(normalized) })
    }
  }
  return sites
}

describe('contract: native platform specifiers', () => {
  const sites = enumerateCallSites()

  it('finds the platform require call sites in the installed packages', () => {
    // A scanner regression must never pass vacuously: sharp's switch alone
    // carries ~30 call sites, canvas's ~50.
    expect(sites.length).toBeGreaterThanOrEqual(50)
    // Both addon shapes are present (otherwise the enumeration is broken).
    expect(sites.some((site) => site.normalized.includes('/sharp.node'))).toBe(true)
    expect(sites.some((site) => site.normalized.startsWith('@napi-rs/canvas-'))).toBe(true)
  })

  it('every call site is a known shape — no unhandled specifiers', () => {
    const unknown = sites.filter((site) => site.klass === 'unknown')
    expect(
      unknown.map((site) => `${site.file}: require(${site.arg})`),
      'a new sharp/canvas platform specifier shape appeared — extend native-require.ts + the plugin',
    ).toEqual([])
  })

  it('the plugin rewrites every platform require call site it scopes', () => {
    for (const file of [
      ...distFiles(packageRoot('sharp')),
      join(packageRoot('@napi-rs/canvas'), 'js-binding.js'),
      join(packageRoot('@napi-rs/canvas'), 'index.js'),
    ]) {
      const source = readFileSync(file, 'utf-8')
      const before = platformRequireArgs(source).length
      const rewritten = redirectNativeRequires(source, file)
      if (before === 0) {
        continue
      }
      expect(rewritten, `${file} has platform requires but the plugin did not fire`).not.toBeNull()
      const output = rewritten!
      // No platform require survives the rewrite; the binding was injected.
      expect(platformRequireArgs(output), `${file} still has unrewritten platform requires`).toEqual([])
      expect(output).toContain('nativeRequire')
      expect(isNativePackageModule(file)).toBe(true)
    }
  })

  it('the plugin leaves non-platform modules untouched', () => {
    expect(
      redirectNativeRequires('const x = require("@img/foo")', join(process.cwd(), 'src/server/infra/sea.ts')),
    ).toBeNull()
    // Requires without platform markers stay for the bundler to inline.
    const canvasIndex = join(packageRoot('@napi-rs/canvas'), 'geometry.js')
    const source = readFileSync(canvasIndex, 'utf-8')
    expect(redirectNativeRequires(source, canvasIndex)).toBeNull()
    // `@img/colour` is a pure-JS dependency, not a platform specifier —
    // even inside a scoped module it must never be redirected (its load
    // is not try/catch-guarded upstream).
    const colourCjs = join(packageRoot('sharp'), 'dist', 'colour.cjs')
    expect(redirectNativeRequires(readFileSync(colourCjs, 'utf-8'), colourCjs)).toBeNull()
  })

  it('the marker predicate agrees with the regex on every enumerated arg', () => {
    for (const site of sites) {
      expect(isPlatformSpecifierArg(site.arg), `predicate disagrees on require(${site.arg})`).toBe(true)
    }
  })
})

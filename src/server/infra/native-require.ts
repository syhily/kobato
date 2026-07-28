// Redirected native require — the runtime half of the SEA native-module
// strategy (the build half is `scripts/sea/redirect-native-requires.ts`).
//
// sharp, @napi-rs/canvas, and @duckdb/node-api are statically imported
// and bundled into the server/worker bundles; the bundler plugin
// rewrites the packages' own platform-specifier `require(...)` call
// sites to `nativeRequire(...)`. This module resolves exactly the
// enumerated specifiers those call sites can produce:
//
//   `@img/sharp-<platform>/sharp.node`     the sharp addon
//   `@napi-rs/canvas-<triple>`             the skia addon
//   `@duckdb/node-bindings-<platform>/duckdb.node`   the DuckDB addon
//   `@img/sharp-libvips-<platform>/versions`   ┐ metadata probes sharp
//   `@img/sharp-libvips-<platform>/package`    │ makes while detecting or
//   `@img/sharp-<platform>/{package,versions}` ┘ diagnosing its binding
//   `@img/sharp-libvips-<platform>/lib`    a search-path string probe
//
// Under SEA (`KOBATO_NATIVES_DIR` set by `bootstrapSeaRuntime`) the addons
// load by ABSOLUTE PATH from the flat natives cache dir — only dynamic
// libraries live there — and the metadata probes are answered from
// embedded `natives-meta/*` blob assets. Outside SEA (dev, vitest,
// `node ./build/server/index.js`, the intermediates run directly) every
// recognized specifier delegates to `requireExternal`, i.e. the regular
// node_modules resolution the packages would have done themselves.
//
// Anything outside the enumerated set throws: sharp's build-from-source
// probes (`../src/build/Release/*.node`), canvas's `./skia.<triple>.node`
// first attempts, the `@img/sharp-libvips-dev/*` headers, and every wasm
// candidate are all wrapped in the packages' own try/catch chains, which
// absorb the throw and walk on to the candidate we do answer. A genuinely
// new specifier in a future sharp/canvas release fails the
// `native-specifiers` contract test at upgrade time, not silently here.
//
// Dependency discipline (same as `@/server/infra/sea`): this module is
// inlined into the worker bundles and evaluates inside the SEA before the
// app graph is up — node builtins, `@/server/infra/sea`, and the
// constants-only `@/shared/sea/assets` only. `process.env` is read here
// for the same reason sea.ts reads it: `KOBATO_NATIVES_DIR` is runtime
// state assigned by the SEA bootstrap after module load (pinned by the
// boundaries contract test).

import { join } from 'node:path'

import { getEmbeddedAsset, requireExternal } from '@/server/infra/sea'
import {
  SEA_NATIVE_ASSET_PREFIX,
  SEA_NATIVE_DUCKDB_ADDON_KEY,
  SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY,
  SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY,
  SEA_NATIVE_META_SHARP_PACKAGE_KEY,
  SEA_NATIVE_META_SHARP_VERSIONS_KEY,
  SEA_NATIVE_SHARP_ADDON_KEY,
  SEA_NATIVE_SKIA_ADDON_KEY,
} from '@/shared/sea/assets'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * sharp's `runtimePlatformArch()`: `${process.platform}${libc}-${process.arch}`
 * where libc is `musl` on non-glibc linux and empty elsewhere. The build is
 * platform-native, so the runtime host triple IS the build target triple.
 */
function sharpPlatform(): string {
  const libc = process.platform === 'linux' && isMuslLinux() ? 'musl' : ''
  return `${process.platform}${libc}-${process.arch}`
}

/** napi-rs triple: `darwin-x64`, `win32-x64-msvc`, `linux-x64-gnu|musl`. */
function canvasTriple(): string {
  if (process.platform === 'linux') {
    return `linux-${process.arch}-${isMuslLinux() ? 'musl' : 'gnu'}`
  }
  if (process.platform === 'win32') {
    return `win32-${process.arch}-msvc`
  }
  return `${process.platform}-${process.arch}`
}

/**
 * Mirrors the musl detection napi-rs and detect-libc use: no glibc runtime
 * version in the process report means musl (or an unknown libc — the
 * delivery targets are all glibc/darwin/msvc, so this only ever flips on
 * a real musl host).
 */
function isMuslLinux(): boolean {
  if (typeof process.report?.getReport !== 'function') {
    return false
  }
  const report = unsafeCast<{ header?: { glibcVersionRuntime?: string } }>(process.report.getReport())
  return report.header?.glibcVersionRuntime === undefined
}

/** duckdb.js's `getRuntimePlatformArch()`: `${platform}-${arch}`, plus the musl suffix on musl linux. */
function duckdbPlatformArch(): string {
  return process.platform === 'linux' && isMuslLinux()
    ? `linux-${process.arch}-musl`
    : `${process.platform}-${process.arch}`
}

const SHARP_PLATFORM = sharpPlatform()
const CANVAS_TRIPLE = canvasTriple()
const DUCKDB_PLATFORM_ARCH = duckdbPlatformArch()

/** The full enumerated specifier set — anything else is a hard error. */
const SHARP_ADDON_SPEC = `@img/sharp-${SHARP_PLATFORM}/sharp.node`
const SHARP_PACKAGE_SPEC = `@img/sharp-${SHARP_PLATFORM}/package`
const SHARP_VERSIONS_SPEC = `@img/sharp-${SHARP_PLATFORM}/versions`
const LIBVIPS_VERSIONS_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/versions`
const LIBVIPS_PACKAGE_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/package`
const LIBVIPS_LIB_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/lib`
const CANVAS_ADDON_SPEC = `@napi-rs/canvas-${CANVAS_TRIPLE}`
const DUCKDB_ADDON_SPEC = `@duckdb/node-bindings-${DUCKDB_PLATFORM_ARCH}/duckdb.node`

/** Extraction file name of an addon asset: its key minus the natives prefix. */
function addonFileName(key: string): string {
  return key.slice(SEA_NATIVE_ASSET_PREFIX.length)
}

/** Parse an embedded `natives-meta/*` JSON asset; a clear error when the build did not embed it. */
function readEmbeddedMetadata<T>(key: string): T {
  const raw = getEmbeddedAsset(key)
  if (raw === null) {
    throw new Error(`native-require: embedded metadata asset missing: ${key}`)
  }
  // The JSON shape is the caller's claim (each probe has its own type).
  return unsafeCast<T>(JSON.parse(raw.toString('utf-8')))
}

/**
 * Resolve one redirected platform specifier. Only ever called from the
 * rewritten call sites inside the bundled sharp / @napi-rs/canvas
 * modules — never from project code directly.
 */
export function nativeRequire<T>(specifier: string): T {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  const underSea = nativesDir !== undefined && nativesDir !== ''

  switch (specifier) {
    case SHARP_ADDON_SPEC:
      // The .node MUST load by absolute path under SEA — there is no
      // package layout in the flat cache dir for a bare specifier to
      // resolve against.
      return requireExternal<T>(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_SHARP_ADDON_KEY)) : specifier)
    case CANVAS_ADDON_SPEC:
      return requireExternal<T>(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_SKIA_ADDON_KEY)) : specifier)
    case DUCKDB_ADDON_SPEC:
      return requireExternal<T>(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_DUCKDB_ADDON_KEY)) : specifier)
    case LIBVIPS_VERSIONS_SPEC:
      return underSea ? readEmbeddedMetadata<T>(SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY) : requireExternal<T>(specifier)
    case LIBVIPS_PACKAGE_SPEC:
      return underSea ? readEmbeddedMetadata<T>(SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY) : requireExternal<T>(specifier)
    case SHARP_PACKAGE_SPEC:
      return underSea ? readEmbeddedMetadata<T>(SEA_NATIVE_META_SHARP_PACKAGE_KEY) : requireExternal<T>(specifier)
    case SHARP_VERSIONS_SPEC:
      // Only win32 platform packages ship a versions.json — elsewhere the
      // asset is absent and this throws into sharp's own try/catch, which
      // falls back to the libvips versions probe (upstream behavior too:
      // the platform package exports no ./versions there).
      return underSea ? readEmbeddedMetadata<T>(SEA_NATIVE_META_SHARP_VERSIONS_KEY) : requireExternal<T>(specifier)
    case LIBVIPS_LIB_SPEC:
      // Upstream this module is `module.exports = __dirname` — a candidate
      // search path for a globally-installed libvips. The flat natives dir
      // is exactly that: it holds the extracted libvips library files.
      return underSea ? unsafeCast<T>(nativesDir) : requireExternal<T>(specifier)
    default:
      throw new Error(`native-require: unresolvable specifier: ${specifier}`)
  }
}

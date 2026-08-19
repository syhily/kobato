// Runtime half of the SEA native-module redirection: resolves the rewritten
// platform-specifier requires — absolute paths from the flat natives dir
// under SEA, embedded `natives-meta/*` metadata, node_modules otherwise.

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

/** Mirrors sharp's `runtimePlatformArch()`: `${platform}${libc}-${arch}`, libc=`musl` on non-glibc linux. */
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

/** Mirrors napi-rs/detect-libc musl detection: no glibc runtime version in the report means musl. */
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

const SHARP_ADDON_SPEC = `@img/sharp-${SHARP_PLATFORM}/sharp.node`
const SHARP_PACKAGE_SPEC = `@img/sharp-${SHARP_PLATFORM}/package`
const SHARP_VERSIONS_SPEC = `@img/sharp-${SHARP_PLATFORM}/versions`
const LIBVIPS_VERSIONS_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/versions`
const LIBVIPS_PACKAGE_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/package`
const LIBVIPS_LIB_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/lib`
const CANVAS_ADDON_SPEC = `@napi-rs/canvas-${CANVAS_TRIPLE}`
const DUCKDB_ADDON_SPEC = `@duckdb/node-bindings-${DUCKDB_PLATFORM_ARCH}/duckdb.node`

function addonFileName(key: string): string {
  return key.slice(SEA_NATIVE_ASSET_PREFIX.length)
}

function readEmbeddedMetadata(key: string): unknown {
  const raw = getEmbeddedAsset(key)
  if (raw === null) {
    throw new Error(`native-require: embedded metadata asset missing: ${key}`)
  }
  // The JSON shape is the caller's claim (each probe has its own type).
  const parsed: unknown = JSON.parse(raw.toString('utf-8'))
  return parsed
}

/**
 * Resolve one redirected platform specifier — only the rewritten call sites
 * inside the bundled native packages call this, never project code.
 */
export function nativeRequire(specifier: string): unknown {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  const underSea = nativesDir !== undefined && nativesDir !== ''

  switch (specifier) {
    case SHARP_ADDON_SPEC:
      // Under SEA the addon must load by absolute path — no package layout in the flat dir.
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_SHARP_ADDON_KEY)) : specifier)
    case CANVAS_ADDON_SPEC:
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_SKIA_ADDON_KEY)) : specifier)
    case DUCKDB_ADDON_SPEC:
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_DUCKDB_ADDON_KEY)) : specifier)
    case LIBVIPS_VERSIONS_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY) : requireExternal(specifier)
    case LIBVIPS_PACKAGE_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY) : requireExternal(specifier)
    case SHARP_PACKAGE_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_SHARP_PACKAGE_KEY) : requireExternal(specifier)
    case SHARP_VERSIONS_SPEC:
      // Only win32 platform packages ship this asset; elsewhere the throw is absorbed by sharp's own fallback.
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_SHARP_VERSIONS_KEY) : requireExternal(specifier)
    case LIBVIPS_LIB_SPEC:
      // Upstream this is `module.exports = __dirname`; the flat natives dir is exactly that search path.
      return underSea ? nativesDir : requireExternal(specifier)
    default:
      throw new Error(`native-require: unresolvable specifier: ${specifier}`)
  }
}

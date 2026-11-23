import {
  SEA_NATIVE_ASSET_PREFIX,
  SEA_NATIVE_DUCKDB_ADDON_KEY,
  SEA_NATIVE_FONT_SPLIT_ADDON_KEY,
  SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY,
  SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY,
  SEA_NATIVE_META_SHARP_PACKAGE_KEY,
  SEA_NATIVE_META_SHARP_VERSIONS_KEY,
  SEA_NATIVE_SHARP_ADDON_KEY,
  SEA_NATIVE_SKIA_ADDON_KEY,
} from '@kobato/distribution/sea-assets'
import { getEmbeddedAsset, requireExternal } from '@kobato/server/infra/sea/sea'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { join } from 'node:path'

function sharpPlatform(): string {
  const libc = process.platform === 'linux' && isMuslLinux() ? 'musl' : ''
  return `${process.platform}${libc}-${process.arch}`
}

function canvasTriple(): string {
  if (process.platform === 'linux') {
    return `linux-${process.arch}-${isMuslLinux() ? 'musl' : 'gnu'}`
  }
  if (process.platform === 'win32') {
    return `win32-${process.arch}-msvc`
  }
  return `${process.platform}-${process.arch}`
}

function isMuslLinux(): boolean {
  if (typeof process.report?.getReport !== 'function') {
    return false
  }
  const report = unsafeCast<{ header?: { glibcVersionRuntime?: string } }>(process.report.getReport())
  return report.header?.glibcVersionRuntime === undefined
}

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

export const FONT_SPLIT_ADDON_SPEC = '@kobato/font-split/font-split.node'

function addonFileName(key: string): string {
  return key.slice(SEA_NATIVE_ASSET_PREFIX.length)
}

function readEmbeddedMetadata(key: string): unknown {
  const raw = getEmbeddedAsset(key)
  if (raw === null) {
    throw Object.assign(new Error(`native-require: embedded metadata asset missing: ${key}`), {
      code: 'ERR_NATIVE_METADATA_MISSING',
    })
  }
  const parsed: unknown = JSON.parse(raw.toString('utf-8'))
  return parsed
}

export function nativeRequire(specifier: string): unknown {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  const underSea = nativesDir !== undefined && nativesDir !== ''

  switch (specifier) {
    case SHARP_ADDON_SPEC:
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_SHARP_ADDON_KEY)) : specifier)
    case CANVAS_ADDON_SPEC:
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_SKIA_ADDON_KEY)) : specifier)
    case DUCKDB_ADDON_SPEC:
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_DUCKDB_ADDON_KEY)) : specifier)
    case FONT_SPLIT_ADDON_SPEC:
      return requireExternal(underSea ? join(nativesDir, addonFileName(SEA_NATIVE_FONT_SPLIT_ADDON_KEY)) : specifier)
    case LIBVIPS_VERSIONS_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY) : requireExternal(specifier)
    case LIBVIPS_PACKAGE_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY) : requireExternal(specifier)
    case SHARP_PACKAGE_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_SHARP_PACKAGE_KEY) : requireExternal(specifier)
    case SHARP_VERSIONS_SPEC:
      return underSea ? readEmbeddedMetadata(SEA_NATIVE_META_SHARP_VERSIONS_KEY) : requireExternal(specifier)
    case LIBVIPS_LIB_SPEC:
      return underSea ? nativesDir : requireExternal(specifier)
    default:
      throw Object.assign(new Error(`native-require: unresolvable specifier: ${specifier}`), {
        code: 'ERR_NATIVE_SPECIFIER_UNRESOLVABLE',
      })
  }
}

import { createHash } from 'node:crypto'

// Fallback site assets bundled into the server build via Vite's glob
// import. SVGs are inlined as raw text (also rendered inline elsewhere);
// binaries are inlined as ArrayBuffers and wrapped in Node Buffers once
// at module init, so requests never touch the filesystem.
//
// This module lives under `src/server/` so a stray client-side import
// of the 430 KB bundle is caught by the path itself.

export const SVG_SLOTS = ['faviconSvg', 'logoSvg', 'logoDarkSvg', 'logoLargeSvg', 'logoLargeDarkSvg'] as const
export type SvgSlot = (typeof SVG_SLOTS)[number]
const SVG_SLOT_SET = new Set<string>(SVG_SLOTS)

export const BINARY_SLOTS = [
  'faviconIco',
  'appleTouchIcon',
  'icon192',
  'icon512',
  'openGraph',
  'blogPoster',
  'blogPosterDark',
  'defaultAvatar',
] as const
export type BinarySlot = (typeof BINARY_SLOTS)[number]
const BINARY_SLOT_SET = new Set<string>(BINARY_SLOTS)

const svgModules = import.meta.glob('./defaults/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const binaryModules = import.meta.glob('./defaults/**/*.{png,ico}', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>

// `favicon.svg` -> `faviconSvg`, `logo-large-dark.svg` -> `logoLargeDarkSvg`,
// `apple-touch-icon.png` -> `appleTouchIcon`, `favicon.ico` -> `faviconIco`.
function keyForFile(path: string): string {
  const filename = path.slice(path.lastIndexOf('/') + 1)
  const match = /^(.+?)\.(svg|ico|png)$/.exec(filename)
  if (!match) {
    throw new Error(`Unexpected default asset filename: ${filename}`)
  }
  const [, base, ext] = match
  const stem = base.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  return ext === 'png' ? stem : `${stem}${ext === 'svg' ? 'Svg' : 'Ico'}`
}

function indexBySlot<T, U, S extends string>(
  modules: Record<string, T>,
  expected: Set<string>,
  kind: 'svg' | 'binary',
  transform: (value: T) => U,
): Record<S, U> {
  const out: Partial<Record<S, U>> = {}
  for (const [path, value] of Object.entries(modules)) {
    const slot = keyForFile(path)
    if (!expected.has(slot)) {
      throw new Error(`Default ${kind} asset ${path} maps to unknown slot "${slot}"`)
    }
    out[slot as S] = transform(value)
  }
  for (const slot of expected) {
    if (!(slot in out)) {
      throw new Error(`Missing default ${kind} asset for slot "${slot}"`)
    }
  }
  return out as Record<S, U>
}

export const DEFAULT_SVG: Readonly<Record<SvgSlot, string>> = indexBySlot(svgModules, SVG_SLOT_SET, 'svg', (raw) => raw)

function dataUriToBuffer(uri: string): Buffer {
  const match = /^data:[^;]+;base64,(.+)$/.exec(uri)
  if (!match) {
    throw new Error(`Expected base64 data URI, got: ${uri.slice(0, 80)}`)
  }
  return Buffer.from(match[1], 'base64')
}

export const DEFAULT_BINARY: Readonly<Record<BinarySlot, Buffer>> = indexBySlot(
  binaryModules,
  BINARY_SLOT_SET,
  'binary',
  dataUriToBuffer,
)

// Pre-computed sha256 (hex) of every bundled default. Used as the ETag
// value for fallback responses so HTTP caches can revalidate without us
// hashing on every request.
function hashRecord<K extends string>(record: Record<K, Buffer | string>): Record<K, string> {
  const out: Partial<Record<K, string>> = {}
  for (const [k, v] of Object.entries(record) as [K, Buffer | string][]) {
    out[k] = createHash('sha256').update(v).digest('hex')
  }
  return out as Record<K, string>
}

export const DEFAULT_SVG_ETAG: Readonly<Record<SvgSlot, string>> = hashRecord(DEFAULT_SVG)
export const DEFAULT_BINARY_ETAG: Readonly<Record<BinarySlot, string>> = hashRecord(DEFAULT_BINARY)

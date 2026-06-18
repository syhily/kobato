import { createHash } from 'node:crypto'

import type { BinarySlot, SvgSlot } from '@/server/assets/defaults'
import type { BrandingObjectRef, StorageDriver } from '@/shared/config/types'

import { BINARY_SLOTS, SVG_SLOTS } from '@/server/assets/defaults'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { activeBackend, backendFor } from '@/server/infra/storage/registry'

const log = getLogger('branding.storage')

// User-asset branding slots — SVGs and binaries. `robotsTxt` is
// configuration text (not an asset) and lives inline in the settings
// row, edited through the regular assets PATCH.
export type BrandingSlot = SvgSlot | BinarySlot

export const BRANDING_SLOTS: readonly BrandingSlot[] = [...SVG_SLOTS, ...BINARY_SLOTS]
const BRANDING_SLOT_SET = new Set<string>(BRANDING_SLOTS)

export function isBrandingSlot(value: unknown): value is BrandingSlot {
  return typeof value === 'string' && BRANDING_SLOT_SET.has(value)
}

export function isBinarySlot(slot: BrandingSlot): slot is BinarySlot {
  return (BINARY_SLOTS as readonly string[]).includes(slot)
}

export function isSvgSlot(slot: BrandingSlot): slot is SvgSlot {
  return (SVG_SLOTS as readonly string[]).includes(slot)
}

// Per-slot expected MIME type. We use it to reject mismatched uploads
// and to set the response `Content-Type` when serving the bytes back.
export const SLOT_CONTENT_TYPE: Readonly<Record<BrandingSlot, string>> = {
  faviconSvg: 'image/svg+xml',
  logoSvg: 'image/svg+xml',
  logoDarkSvg: 'image/svg+xml',
  logoLargeSvg: 'image/svg+xml',
  logoLargeDarkSvg: 'image/svg+xml',
  faviconIco: 'image/x-icon',
  appleTouchIcon: 'image/png',
  icon192: 'image/png',
  icon512: 'image/png',
  openGraph: 'image/png',
  blogPoster: 'image/png',
  blogPosterDark: 'image/png',
  defaultAvatar: 'image/png',
}

// Per-slot byte ceiling. We bound individual uploads so an oversized
// hero image can't blow up the S3 bill — and so the bundled defaults
// can be treated as worst-case footprint estimates.
export const SLOT_MAX_BYTES: Readonly<Record<BrandingSlot, number>> = {
  faviconSvg: 50 * 1024,
  logoSvg: 100 * 1024,
  logoDarkSvg: 100 * 1024,
  logoLargeSvg: 200 * 1024,
  logoLargeDarkSvg: 200 * 1024,
  faviconIco: 100 * 1024,
  appleTouchIcon: 200 * 1024,
  icon192: 100 * 1024,
  icon512: 300 * 1024,
  openGraph: 600 * 1024,
  blogPoster: 600 * 1024,
  blogPosterDark: 600 * 1024,
  defaultAvatar: 100 * 1024,
}

// --- Per-kind content validation ---

// Patterns that give an SVG side-effects when the response is opened
// directly (e.g. visiting `/favicon.svg` in a tab). Reject up-front so a
// stolen admin session can't poison the asset URL with a script.
const SVG_DANGEROUS = [
  /<script\b/i,
  /\son[a-z]+\s*=/i,
  /<foreignObject\b/i,
  /(?:href|xlink:href)\s*=\s*["']?\s*javascript:/i,
]

function looksLikeSvg(buffer: Buffer): boolean {
  // Skip a leading BOM and whitespace; the SVG must begin with `<?xml`
  // or `<svg`. The strictest check that still accepts real artwork.
  const text = buffer.toString('utf8').replace(/^﻿/, '').trimStart()
  return text.startsWith('<?xml') || text.startsWith('<svg')
}

function validateSvg(buffer: Buffer): void {
  if (!looksLikeSvg(buffer)) {
    throw new ActionFailure(400, '上传文件不是有效的 SVG')
  }
  const text = buffer.toString('utf8')
  for (const pattern of SVG_DANGEROUS) {
    if (pattern.test(text)) {
      throw new ActionFailure(400, '上传的 SVG 含有脚本或事件处理器，已拒绝')
    }
  }
}

// Magic-byte sniff for binaries. Without it we'd happily serve
// `200 image/png` for an HTML page or a zip file pasted into a slot.
function detectBinaryContentType(buffer: Buffer): 'image/png' | 'image/x-icon' | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return 'image/x-icon'
  }
  return null
}

function validateBinary(slot: BinarySlot, buffer: Buffer): void {
  const detected = detectBinaryContentType(buffer)
  const expected = SLOT_CONTENT_TYPE[slot]
  if (detected !== expected) {
    throw new ActionFailure(400, `${slot} 必须是 ${expected} 格式文件`)
  }
}

export function ensureMatchesSlot(slot: BrandingSlot, buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new ActionFailure(400, '上传文件为空')
  }
  if (buffer.length > SLOT_MAX_BYTES[slot]) {
    throw new ActionFailure(400, `${slot} 文件超过 ${SLOT_MAX_BYTES[slot]} 字节上限`)
  }
  if (isSvgSlot(slot)) {
    validateSvg(buffer)
    return
  }
  validateBinary(slot, buffer)
}

// Stable kebab-case conversion: `faviconIco` -> `favicon-ico`,
// `blogPosterDark` -> `blog-poster-dark`. The slot name appears in the
// S3 key so the admin can browse `branding/<slot>` in their bucket and
// recognise each entry without consulting the codebase.
function slotToKebab(slot: BrandingSlot): string {
  return slot.replace(/([A-Z0-9]+)/g, (_, c: string) => `-${c.toLowerCase()}`)
}

export function s3KeyForSlot(slot: BrandingSlot): string {
  return `branding/${slotToKebab(slot)}`
}

// --- Operations ---

export async function putBrandingObject(slot: BrandingSlot, buffer: Buffer): Promise<BrandingObjectRef> {
  ensureMatchesSlot(slot, buffer)
  const contentType = SLOT_CONTENT_TYPE[slot]
  const key = s3KeyForSlot(slot)
  const { backend, driver } = activeBackend()
  await backend.put({ key, body: buffer, contentType, visibility: 'private' })
  const etag = createHash('sha256').update(buffer).digest('hex')
  const ref: BrandingObjectRef = {
    etag,
    contentType,
    size: buffer.length,
    updatedAt: new Date().toISOString(),
    driver,
  }
  cacheSet(slot, etag, buffer)
  log.info('Branding object uploaded', { slot, key, driver, size: buffer.length, etag })
  return ref
}

// Best-effort delete — if the backend already lacks the object (e.g.
// operator pruned the bucket / removed the local file manually) the
// admin's "clear" should still succeed at the settings layer. Real
// failures surface to the caller. `driver` targets the backend the ref
// was uploaded to, so a local asset isn't looked up in S3.
export async function deleteBrandingObject(slot: BrandingSlot, driver: StorageDriver = 's3'): Promise<void> {
  const key = s3KeyForSlot(slot)
  try {
    await backendFor(driver).delete(key)
    log.info('Branding object deleted', { slot, key, driver })
  } catch (error) {
    log.warn('Failed to delete branding object; continuing', { slot, key, driver, error: String(error) })
  }
  for (const cacheKey of Array.from(bufferCache.keys())) {
    if (cacheKey.startsWith(`${slot}:`)) {
      bufferCache.delete(cacheKey)
    }
  }
}

// --- Read path with in-process cache ---

// Each branding slot is at most a few hundred KB. Keep the latest bytes
// per (slot, etag) in memory so subsequent requests skip the S3 round-
// trip. Etag-keyed so a re-upload to the same slot deterministically
// misses the cache.
const bufferCache = new Map<string, Buffer>()
const MAX_CACHE_ENTRIES = 64

function cacheSet(slot: BrandingSlot, etag: string, buffer: Buffer): void {
  if (bufferCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = bufferCache.keys().next().value
    if (oldest) {
      bufferCache.delete(oldest)
    }
  }
  bufferCache.set(`${slot}:${etag}`, buffer)
}

function cacheGet(slot: BrandingSlot, etag: string): Buffer | undefined {
  return bufferCache.get(`${slot}:${etag}`)
}

// Returns `null` (rather than throwing) when the object can't be
// fetched — the route handler falls back to the bundled default. This
// matches how `OG` and `font` loaders treat missing optional assets:
// availability of a custom branding upload should never 5xx the
// `/favicon.ico` route.
export async function fetchBrandingObject(slot: BrandingSlot, ref: BrandingObjectRef): Promise<Buffer | null> {
  const cached = cacheGet(slot, ref.etag)
  if (cached !== undefined) {
    return cached
  }
  const driver = ref.driver
  try {
    const buffer = await backendFor(driver).get(s3KeyForSlot(slot))
    cacheSet(slot, ref.etag, buffer)
    return buffer
  } catch (error) {
    log.warn('Failed to fetch branding object; falling back to default', {
      slot,
      etag: ref.etag,
      driver,
      error: String(error),
    })
    return null
  }
}

import type { Database } from '@kobato/db/database.ts'
import type { BinarySlot, SvgSlot } from '@kobato/server/assets/defaults.ts'
import type { BrandingObjectRef, StorageDriver } from '@kobato/settings/types.ts'

import { findSettingByScope, upsertSetting } from '@kobato/db/operations/setting.ts'
import { BINARY_SLOTS, SVG_SLOTS } from '@kobato/server/assets/defaults.ts'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { ActionFailure } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { StorageObjectNotFound } from '@kobato/server/infra/storage/backend.ts'
import { activeBackend, backendFor } from '@kobato/server/infra/storage/registry.ts'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry.ts'
import { createBoundedMap } from '@kobato/utils/memo.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { createHash } from 'node:crypto'

const log = getLogger('branding.storage')

export type BrandingSlot = SvgSlot | BinarySlot

export const BRANDING_SLOTS: readonly BrandingSlot[] = [...SVG_SLOTS, ...BINARY_SLOTS]
const BRANDING_SLOT_SET = new Set<string>(BRANDING_SLOTS)

export function isBrandingSlot(value: unknown): value is BrandingSlot {
  return typeof value === 'string' && BRANDING_SLOT_SET.has(value)
}

export function isSvgSlot(slot: BrandingSlot): slot is SvgSlot {
  return (SVG_SLOTS as readonly string[]).includes(slot)
}

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
  defaultMusicCover: 'image/png',
}

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
  defaultMusicCover: 100 * 1024,
}

const SVG_DANGEROUS = [
  /<script\b/i,
  /\son[a-z]+\s*=/i,
  /<foreignObject\b/i,
  /(?:href|xlink:href)\s*=\s*["']?\s*javascript:/i,
]

function looksLikeSvg(buffer: Buffer): boolean {
  const text = buffer.toString('utf8').replace(/^﻿/, '').trimStart()
  return text.startsWith('<?xml') || text.startsWith('<svg')
}

function validateSvg(buffer: Buffer): void {
  if (!looksLikeSvg(buffer)) {
    throw new ActionFailure(400, descriptorFor('assets.error.invalidSvg'))
  }
  const text = buffer.toString('utf8')
  for (const pattern of SVG_DANGEROUS) {
    if (pattern.test(text)) {
      throw new ActionFailure(400, descriptorFor('assets.error.svgScript'))
    }
  }
}

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
    throw new ActionFailure(400, descriptorFor('assets.error.slotFormat', { slot, type: expected }))
  }
}

export function ensureMatchesSlot(slot: BrandingSlot, buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new ActionFailure(400, descriptorFor('common.error.uploadEmpty'))
  }
  if (buffer.length > SLOT_MAX_BYTES[slot]) {
    throw new ActionFailure(400, descriptorFor('assets.error.slotTooLarge', { slot, max: SLOT_MAX_BYTES[slot] }))
  }
  if (isSvgSlot(slot)) {
    validateSvg(buffer)
    return
  }
  validateBinary(slot, buffer)
}

function slotBaseName(slot: BrandingSlot): string {
  if (slot.endsWith('Svg')) {
    return slot.slice(0, -3)
  }
  if (slot.endsWith('Ico')) {
    return slot.slice(0, -3)
  }
  return slot
}

function slotToKebab(slot: BrandingSlot): string {
  return slotBaseName(slot).replace(/([A-Z0-9]+)/g, (_, c: string) => `-${c.toLowerCase()}`)
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/png': '.png',
}

function extensionForSlot(slot: BrandingSlot): string {
  return EXT_BY_CONTENT_TYPE[SLOT_CONTENT_TYPE[slot]] ?? ''
}

export function s3KeyForSlot(slot: BrandingSlot): string {
  return `branding/${slotToKebab(slot)}${extensionForSlot(slot)}`
}

function slotToKebabLegacy(slot: BrandingSlot): string {
  return slot.replace(/([A-Z0-9]+)/g, (_, c: string) => `-${c.toLowerCase()}`)
}

export function legacyKeyForSlot(slot: BrandingSlot): string {
  return `branding/${slotToKebabLegacy(slot)}`
}

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

  const legacyKey = legacyKeyForSlot(slot)
  backend.delete(legacyKey).catch((error) => {
    log.debug('Legacy key cleanup skipped', { slot, legacyKey, error: String(error) })
  })

  return ref
}

export async function deleteBrandingObject(slot: BrandingSlot, driver: StorageDriver = 's3'): Promise<void> {
  const backend = backendFor(driver)
  const key = s3KeyForSlot(slot)
  const legacyKey = legacyKeyForSlot(slot)

  const results = await Promise.allSettled([backend.delete(key), backend.delete(legacyKey)])
  for (const [i, k] of [key, legacyKey].entries()) {
    const r = results[i]
    if (r.status === 'rejected') {
      log.warn('Failed to delete branding object; continuing', { slot, key: k, driver, error: String(r.reason) })
    } else {
      log.info('Branding object deleted', { slot, key: k, driver })
    }
  }

  for (const cacheKey of Array.from(bufferCache.keys())) {
    if (cacheKey.startsWith(`${slot}:`)) {
      bufferCache.delete(cacheKey)
    }
  }
}

const bufferCache = createBoundedMap<string, Buffer>(64)

function cacheSet(slot: BrandingSlot, etag: string, buffer: Buffer): void {
  bufferCache.set(`${slot}:${etag}`, buffer)
}

function cacheGet(slot: BrandingSlot, etag: string): Buffer | undefined {
  return bufferCache.get(`${slot}:${etag}`)
}

export async function fetchBrandingObject(slot: BrandingSlot, ref: BrandingObjectRef): Promise<Buffer | null> {
  const cached = cacheGet(slot, ref.etag)
  if (cached !== undefined) {
    return cached
  }
  const driver = ref.driver
  const backend = backendFor(driver)
  const key = s3KeyForSlot(slot)

  try {
    const buffer = await backend.get(key)
    cacheSet(slot, ref.etag, buffer)
    return buffer
  } catch (error) {
    if (error instanceof StorageObjectNotFound) {
      const legacyKey = legacyKeyForSlot(slot)
      try {
        const legacyBuffer = await backend.get(legacyKey)
        await backend.put({
          key,
          body: legacyBuffer,
          contentType: ref.contentType,
          visibility: 'private',
        })
        backend.delete(legacyKey).catch((delErr) => {
          log.warn('Legacy key cleanup after migration failed', { slot, legacyKey, error: String(delErr) })
        })
        cacheSet(slot, ref.etag, legacyBuffer)
        log.info('Branding object auto-migrated to extensioned key', { slot, legacyKey, key, driver })
        return legacyBuffer
      } catch (legacyError) {
        log.warn('Failed to fetch branding object; falling back to default', {
          slot,
          etag: ref.etag,
          driver,
          error: String(legacyError),
        })
        return null
      }
    }

    log.warn('Failed to fetch branding object; falling back to default', {
      slot,
      etag: ref.etag,
      driver,
      error: String(error),
    })
    return null
  }
}

export async function flipBrandingDrivers(db: Database, from: StorageDriver, to: StorageDriver): Promise<void> {
  const scope = SECTION_REGISTRY.assets.scope
  const existing = findSettingByScope(db, scope)
  if (existing === null) {
    return
  }
  const data = { ...unsafeCast<Record<string, unknown>>(existing.data) }
  const branding = { ...unsafeCast<Record<string, BrandingObjectRef | undefined>>(data.branding) }
  let changed = false
  for (const slot of BRANDING_SLOTS) {
    const ref = branding[slot]
    if (ref?.driver === from) {
      branding[slot] = { ...ref, driver: to }
      changed = true
    }
  }
  if (changed) {
    data.branding = branding
    upsertSetting(db, data, null, scope)
    await refreshBlogSettings(db)
  }
}

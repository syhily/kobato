import type { Database } from '@kobato/db/database'
import type { BrandingObjectRef } from '@kobato/settings/types'

import { findSettingByScope, upsertSetting } from '@kobato/db/operations/setting'
import { type BinarySlot } from '@kobato/server/assets/defaults'
import { generateFaviconPack } from '@kobato/server/domains/assets/generate'
import {
  type BrandingSlot,
  deleteBrandingObject,
  ensureMatchesSlot,
  putBrandingObject,
} from '@kobato/server/domains/assets/services/storage'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { activeBackend } from '@kobato/server/infra/storage/registry'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const log = getLogger('branding.management')

const FAVICON_DERIVED_SLOTS = [
  'faviconIco',
  'appleTouchIcon',
  'icon192',
  'icon512',
] as const satisfies readonly BinarySlot[]

export async function uploadBrandingAsset(
  db: Database,
  slot: BrandingSlot,
  buffer: Buffer,
): Promise<BrandingObjectRef> {
  ensureMatchesSlot(slot, buffer)
  const { driver } = activeBackend()
  const uploaded: BrandingSlot[] = []
  try {
    const primaryRef = await putBrandingObject(slot, buffer)
    uploaded.push(slot)

    if (slot === 'faviconSvg') {
      const pack = await generateFaviconPack(buffer.toString('utf8'))
      const refs: Partial<Record<BinarySlot, BrandingObjectRef>> = {}
      for (const derived of FAVICON_DERIVED_SLOTS) {
        refs[derived] = await putBrandingObject(derived, pack[derived])
        uploaded.push(derived)
      }
      const merged = unsafeCast<Record<BrandingSlot, BrandingObjectRef>>({ ...refs, [slot]: primaryRef })
      await persistBranding(db, merged)
      return primaryRef
    }

    await persistBranding(db, unsafeCast<Record<BrandingSlot, BrandingObjectRef>>({ [slot]: primaryRef }))
    return primaryRef
  } catch (error) {
    log.warn('Branding upload failed; rolling back uploaded objects', { slot, driver, uploaded, error: String(error) })
    await Promise.allSettled(uploaded.map((s) => deleteBrandingObject(s, driver)))
    throw error
  }
}

export async function clearBrandingAsset(db: Database, slot: BrandingSlot): Promise<void> {
  const slotsToClear: BrandingSlot[] = slot === 'faviconSvg' ? [slot, ...FAVICON_DERIVED_SLOTS] : [slot]
  const row = await readAssetsRow(db)
  const branding = unsafeCast<Record<string, BrandingObjectRef>>(row.branding ?? {})
  await Promise.all(slotsToClear.map((s) => deleteBrandingObject(s, branding[s]?.driver ?? 's3')))
  await persistBrandingDelete(db, slotsToClear)
}

async function readAssetsRow(db: Database): Promise<Record<string, unknown>> {
  const existing = findSettingByScope(db, SECTION_REGISTRY.assets.scope)
  if (!existing) {
    throw new ActionFailure(409, descriptorFor('assets.error.settingsNotInstalled'))
  }
  return { ...unsafeCast<Record<string, unknown>>(existing.data) }
}

async function persistBranding(db: Database, refs: Record<string, BrandingObjectRef>): Promise<void> {
  const row = await readAssetsRow(db)
  const branding = { ...unsafeCast<Record<string, unknown> | undefined>(row.branding) }
  for (const [slot, ref] of Object.entries(refs)) {
    branding[slot] = ref
  }
  row.branding = branding
  upsertSetting(db, row, null, SECTION_REGISTRY.assets.scope)
  await refreshBlogSettings(db)
}

async function persistBrandingDelete(db: Database, slots: BrandingSlot[]): Promise<void> {
  const row = await readAssetsRow(db)
  const branding = { ...unsafeCast<Record<string, unknown> | undefined>(row.branding) }
  for (const slot of slots) {
    delete branding[slot]
  }
  row.branding = branding
  upsertSetting(db, row, null, SECTION_REGISTRY.assets.scope)
  await refreshBlogSettings(db)
}

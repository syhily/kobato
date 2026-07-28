import type { Database } from '@/server/infra/db/database'
import type { BrandingObjectRef } from '@/shared/config/types'

import { type BinarySlot } from '@/server/assets/defaults'
import { generateFaviconPack } from '@/server/domains/assets/generate'
import {
  type BrandingSlot,
  deleteBrandingObject,
  ensureMatchesSlot,
  putBrandingObject,
} from '@/server/domains/assets/services/storage'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { activeBackend } from '@/server/infra/storage/registry'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('branding.management')

// The 4 binary slots that derive from `branding.faviconSvg`. Uploading
// a new SVG regenerates and re-uploads all four; clearing the SVG also
// clears them. The favicon pack is the only branding cross-slot
// dependency; logos / posters / avatars are independent.
const FAVICON_DERIVED_SLOTS = [
  'faviconIco',
  'appleTouchIcon',
  'icon192',
  'icon512',
] as const satisfies readonly BinarySlot[]

// Upload a buffer for one branding slot. When `slot === 'faviconSvg'`
// we also regenerate the favicon pack so the four derived icons stay
// in sync with the SVG. Every new ObjectRef is committed in a single
// settings upsert; on any failure we delete every object we just put so
// no stale bytes or partial pack are left behind.
export async function uploadBrandingAsset(
  db: Database,
  slot: BrandingSlot,
  buffer: Buffer,
): Promise<BrandingObjectRef> {
  ensureMatchesSlot(slot, buffer)
  // Every put in this flow targets the active backend; capture the driver
  // once so the rollback deletes the right bytes if something fails.
  const { driver } = activeBackend()
  const uploaded: BrandingSlot[] = []
  try {
    const primaryRef = await putBrandingObject(slot, buffer)
    uploaded.push(slot)

    if (slot === 'faviconSvg') {
      const pack = await generateFaviconPack(buffer.toString('utf8'))
      const refs: Partial<Record<BinarySlot, BrandingObjectRef>> = {}
      // Sequential rather than parallel: an early failure short-
      // circuits and the `catch` below only has to clean up the
      // refs already in `uploaded`.
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

// Clear a branding slot. For `faviconSvg` we also tear down the four
// derived icons so admins don't end up with a mismatched favicon SVG +
// stale PNG/ICO pack. Each slot's bytes are deleted from the backend its
// ref records, so a local-uploaded asset is removed from disk.
export async function clearBrandingAsset(db: Database, slot: BrandingSlot): Promise<void> {
  const slotsToClear: BrandingSlot[] = slot === 'faviconSvg' ? [slot, ...FAVICON_DERIVED_SLOTS] : [slot]
  const row = await readAssetsRow(db)
  const branding = unsafeCast<Record<string, BrandingObjectRef>>(row.branding ?? {})
  await Promise.all(slotsToClear.map((s) => deleteBrandingObject(s, branding[s]?.driver ?? 's3')))
  await persistBrandingDelete(db, slotsToClear)
}

// --- Settings-row helpers ---

async function readAssetsRow(db: Database): Promise<Record<string, unknown>> {
  const existing = findSettingByScope(db, SECTION_REGISTRY.assets.scope)
  if (!existing) {
    throw new ActionFailure(409, '尚未安装站点设置，无法上传品牌素材')
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

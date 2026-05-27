import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BrandingObjectRef } from '@/shared/config/types'

import { type BinarySlot } from '@/server/assets/defaults'
import { generateFaviconPack } from '@/server/domains/assets/generate'
import {
  type BrandingSlot,
  deleteBrandingObject,
  ensureMatchesSlot,
  isBrandingSlot,
  putBrandingObject,
} from '@/server/domains/assets/storage'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections'
import { refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

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

export { isBrandingSlot, type BrandingSlot }

// Upload a buffer for one branding slot. When `slot === 'faviconSvg'`
// we also regenerate the favicon pack so the four derived icons stay
// in sync with the SVG. The settings row is updated atomically: every
// new ObjectRef is committed in a single upsert.
//
// Failure modes:
//   - S3 upload fails for the primary slot → caller sees the error,
//     row untouched, no S3 leak (we delete on rollback below).
//   - Favicon-pack generation or one of its uploads fails → we delete
//     every object we just put (including the freshly-uploaded SVG)
//     so the operator can retry without leaving stale bytes in S3 or
//     a partial pack in the row.
export async function uploadBrandingAsset(
  db: NodePgDatabase,
  slot: BrandingSlot,
  buffer: Buffer,
): Promise<BrandingObjectRef> {
  ensureMatchesSlot(slot, buffer)
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
      const merged = { ...refs, [slot]: primaryRef } as Record<BrandingSlot, BrandingObjectRef>
      await persistBranding(db, merged)
      return primaryRef
    }

    await persistBranding(db, { [slot]: primaryRef } as Record<BrandingSlot, BrandingObjectRef>)
    return primaryRef
  } catch (error) {
    log.warn('Branding upload failed; rolling back S3 objects', { slot, uploaded, error: String(error) })
    await Promise.allSettled(uploaded.map((s) => deleteBrandingObject(s)))
    throw error
  }
}

// Clear a branding slot. For `faviconSvg` we also tear down the four
// derived icons so admins don't end up with a mismatched favicon SVG +
// stale PNG/ICO pack.
export async function clearBrandingAsset(db: NodePgDatabase, slot: BrandingSlot): Promise<void> {
  const slotsToClear: BrandingSlot[] = slot === 'faviconSvg' ? [slot, ...FAVICON_DERIVED_SLOTS] : [slot]
  await Promise.all(slotsToClear.map((s) => deleteBrandingObject(s)))
  await persistBrandingDelete(db, slotsToClear)
}

// --- Settings-row helpers ---

async function readAssetsRow(db: NodePgDatabase): Promise<Record<string, unknown>> {
  const existing = await findSettingByScope(db, SECTION_REGISTRY.assets.scope)
  if (!existing) {
    throw new ActionFailure(409, '尚未安装站点设置，无法上传品牌素材')
  }
  return { ...(existing.data as Record<string, unknown>) }
}

async function persistBranding(db: NodePgDatabase, refs: Record<string, BrandingObjectRef>): Promise<void> {
  const row = await readAssetsRow(db)
  const branding = { ...(row.branding as Record<string, unknown> | undefined) }
  for (const [slot, ref] of Object.entries(refs)) {
    branding[slot] = ref
  }
  row.branding = branding
  await upsertSetting(db, row, null, SECTION_REGISTRY.assets.scope)
  await refreshBlogSettings(db)
}

async function persistBrandingDelete(db: NodePgDatabase, slots: BrandingSlot[]): Promise<void> {
  const row = await readAssetsRow(db)
  const branding = { ...(row.branding as Record<string, unknown> | undefined) }
  for (const slot of slots) {
    delete branding[slot]
  }
  row.branding = branding
  await upsertSetting(db, row, null, SECTION_REGISTRY.assets.scope)
  await refreshBlogSettings(db)
}

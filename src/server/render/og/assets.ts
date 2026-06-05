import { Buffer } from 'node:buffer'
import { access, readFile } from 'node:fs/promises'

import { resolveSiteAsset } from '@/server/domains/assets/services/routes'
import { getLogger } from '@/server/infra/logger'
import { FONT_DIR } from '@/server/infra/paths'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// The OG renderer composes the dark-mode logo into the generated card.
// Resolving via `resolveSiteAsset` keeps a single code path for the
// custom-upload + bundled-default fallback (in-process cache included)
// so the render side never re-implements the S3 fetch flow.
export async function logoDark(): Promise<Buffer> {
  const resolved = await resolveSiteAsset('/logo-dark.svg')
  if (!resolved) {
    throw new Error('logo-dark.svg not registered in ASSET_ROUTES')
  }
  return resolved.content
}

// -------- Canvas fonts (`fonts.og` / `fonts.calendar` from settings) --------
//
// TTF/OTF files are uploaded through the admin panel and stored under
// FONT_DIR with fixed filenames: `og.{ttf,otf}` and `calendar.{ttf,otf}`.
// The admin only configures the font-family name in `/admin/settings/fonts`.
//
// At render time, both extensions are probed (`.ttf` first, then `.otf`)
// to find whichever file was uploaded.
//
// A single process-level Map caches the Buffer so repeated renders
// don't re-read disk. Uploading a new font clears the cache so the
// new file is picked up without a process restart.
//
// Failure mode is **null, not throw**. An admin who hasn't uploaded
// the file, or a missing file, must NOT 500 the OG / calendar route.
// The renderer skips `GlobalFonts.register()` for null buffers and
// Canvas falls back to its built-in system CJK shaper.

const log = getLogger('images.assets')

export interface FontSlot {
  buffer: Buffer
  family: string
}

const inProcessByPath = new Map<string, Buffer>()

// Deduplicates the "no family configured" / "no font file found" logs so
// operators see them once per replica, not on every render.
const loggedEmpty = new Set<'og' | 'calendar'>()
const loggedMissing = new Set<string>()

async function resolveFontPath(slot: 'og' | 'calendar'): Promise<string | null> {
  const ttf = `${FONT_DIR}/${slot}.ttf`
  const otf = `${FONT_DIR}/${slot}.otf`
  try {
    await access(ttf)
    return ttf
  } catch {
    // try .otf
  }
  try {
    await access(otf)
    return otf
  } catch {
    return null
  }
}

/** Clear cached font buffers so newly-uploaded files are picked up. */
export function resetFontCache(): void {
  inProcessByPath.clear()
  loggedMissing.clear()
}

async function loadFontSlot(slot: 'og' | 'calendar'): Promise<FontSlot | null> {
  const fonts = requireBlogSettingsSection('fonts')
  const family = fonts[slot].family
  if (family === '') {
    if (!loggedEmpty.has(slot)) {
      log.info('Canvas font slot has no family configured; using fallback system font', { slot })
      loggedEmpty.add(slot)
    }
    return null
  }
  loggedEmpty.delete(slot)

  const fullPath = await resolveFontPath(slot)
  if (!fullPath) {
    if (!loggedMissing.has(slot)) {
      log.warn('No font file found for slot', { slot })
      loggedMissing.add(slot)
    }
    return null
  }
  loggedMissing.delete(fullPath)

  const cached = inProcessByPath.get(fullPath)
  if (cached !== undefined) {
    return { buffer: cached, family }
  }

  try {
    const buffer = await readFile(fullPath)
    inProcessByPath.set(fullPath, buffer)
    log.info('Loaded Canvas font slot', { slot, path: fullPath, family, bytes: buffer.byteLength })
    return { buffer, family }
  } catch (err) {
    if (!loggedMissing.has(fullPath)) {
      log.warn('Failed to load Canvas font slot', {
        slot,
        path: fullPath,
        err: err instanceof Error ? err.message : String(err),
      })
      loggedMissing.add(fullPath)
    }
    return null
  }
}

export function oppoSans(): Promise<FontSlot | null> {
  return loadFontSlot('og')
}

export function oppoSerif(): Promise<FontSlot | null> {
  return loadFontSlot('calendar')
}

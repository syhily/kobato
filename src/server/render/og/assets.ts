import { GlobalFonts } from '@napi-rs/canvas'
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
// don't re-read disk. Uploading a new font clears the buffer cache
// (`resetFontCache`) and the registered slot state (`resetCanvasFont`)
// so the new file is picked up without a process restart.
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

// -------- Canvas font single-flight registration --------
//
// Single-flight font registration: if a deploy spike fires 50 canvas
// renders in parallel, only the first one reads the TTF — the rest
// await the same Promise. Slot is null when the admin hasn't
// configured the path/family yet (or the file is missing); in that
// case we skip `GlobalFonts.register` and Canvas falls back to its
// built-in CJK shaper so the image still renders, just with system
// typography.
//
// CRITICAL: the single-flight promise must NOT memoize the "skipped"
// path. If the admin starts with empty fields, fills them later, and
// we'd kept a resolved no-op promise here, every subsequent render
// would short-circuit on that cached resolution and never re-attempt
// the load — the dynamic strategy would only take effect after a
// process restart. So we clear the flight whenever the font is
// *not* registered after the work runs, both on success-but-null and
// on caught error.
//
// The slot assignment is unconditional once a font loads: even when
// the family is already registered (HMR re-registration, or the og
// and calendar slots sharing a family), callers still need the loaded
// family. Gating the assignment on `!GlobalFonts.has(...)` would leave
// the slot null forever — every render re-reading the TTF AND falling
// back to the system font despite the custom font being usable.
//
// Invalidation has two seams, both funneling through `resetCanvasFont`:
// the font-upload route calls it after replacing the file, and the fast
// path below re-checks the configured family on every call so a settings
// edit takes effect on the very next render. Neither needs a restart.

const canvasFontSlots: Record<'og' | 'calendar', FontSlot | null> = { og: null, calendar: null }
const canvasFontFlights: Record<'og' | 'calendar', Promise<FontSlot | null> | null> = {
  og: null,
  calendar: null,
}

export function ensureCanvasFont(slot: 'og' | 'calendar'): Promise<FontSlot | null> {
  const cached = canvasFontSlots[slot]
  if (cached !== null) {
    // Settings-family recheck. `requireBlogSettingsSection` is a
    // synchronous in-memory read (the settings snapshot lives in process
    // memory), so this costs nothing per render. If the admin edited the
    // family — including clearing it to '' — the cached slot is stale:
    // drop it and fall through to a fresh load (an empty family lands on
    // the null / system-fallback path).
    if (requireBlogSettingsSection('fonts')[slot].family !== cached.family) {
      resetCanvasFont(slot)
    } else if (GlobalFonts.has(cached.family)) {
      // Fast path: font already registered. No promise indirection needed.
      return Promise.resolve(cached)
    }
  }
  let flight = canvasFontFlights[slot]
  if (flight === null) {
    flight = (async () => {
      const loaded = await loadFontSlot(slot)
      if (loaded !== null) {
        if (!GlobalFonts.has(loaded.family)) {
          GlobalFonts.register(loaded.buffer, loaded.family)
        }
        canvasFontSlots[slot] = loaded
      }
      return canvasFontSlots[slot]
    })()
      .catch((err) => {
        canvasFontFlights[slot] = null
        throw err
      })
      .finally(() => {
        const s = canvasFontSlots[slot]
        // If the work resolved without actually registering (null
        // slot, snapshot race), drop the single-flight so the next
        // render re-reads settings and re-loads.
        if (s === null || !GlobalFonts.has(s.family)) {
          canvasFontFlights[slot] = null
        }
      })
    canvasFontFlights[slot] = flight
  }
  return flight
}

/**
 * The single invalidation seam for canvas fonts: clears the cached slot
 * and any in-flight load for one slot (or all slots when called without
 * an argument). The font-upload route calls this after replacing a file,
 * and `ensureCanvasFont`'s fast path calls it on a settings-family
 * mismatch — any future font mutation (e.g. a delete route) must call
 * it too. Tests use it to exercise the registration paths.
 */
export function resetCanvasFont(slot?: 'og' | 'calendar'): void {
  if (slot === undefined) {
    canvasFontSlots.og = null
    canvasFontSlots.calendar = null
    canvasFontFlights.og = null
    canvasFontFlights.calendar = null
    return
  }
  canvasFontSlots[slot] = null
  canvasFontFlights[slot] = null
}

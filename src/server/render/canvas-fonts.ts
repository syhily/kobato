import { GlobalFonts } from '@napi-rs/canvas'
import { Buffer } from 'node:buffer'
import { access, readFile } from 'node:fs/promises'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { getLogger } from '@/server/infra/logger'
import { FONT_DIR } from '@/server/infra/paths'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Statically imported; the SEA bundler redirects the platform addon load to nativeRequire.

// Shared by the OG and calendar renderers: fixed filenames (`og|calendar.{ttf,otf}`)
// under FONT_DIR, probed `.ttf` first, with a process-level buffer cache cleared by
// resetFontCache/resetCanvasFont. Failure mode is null, never throw.

const log = getLogger('images.assets')

export interface FontSlot {
  buffer: Buffer
  family: string
}

const inProcessByPath = new Map<string, Buffer>()

// Log each missing-slot case once per replica, not per render.
const loggedEmpty = new Set<'og' | 'calendar'>()
const loggedMissing = new Set<string>()

async function resolveFontPath(slot: 'og' | 'calendar'): Promise<string | null> {
  const ttf = `${FONT_DIR}/${slot}.ttf`
  const otf = `${FONT_DIR}/${slot}.otf`
  try {
    await access(ttf)
    return ttf
  } catch {
    // No .ttf for this slot — fall through to the .otf probe.
  }
  try {
    await access(otf)
    return otf
  } catch {
    return null
  }
}

export function resetFontCache(): void {
  inProcessByPath.clear()
  loggedMissing.clear()
}

interface LoadedFont extends FontSlot {
  path: string
}

async function loadFontSlot(slot: 'og' | 'calendar', family: string): Promise<LoadedFont | null> {
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
    return { buffer: cached, family, path: fullPath }
  }

  try {
    const buffer = await readFile(fullPath)
    // Cache write happens in the caller's generation-guarded commit.
    log.info('Loaded Canvas font slot', { slot, path: fullPath, family, bytes: buffer.byteLength })
    return { buffer, family, path: fullPath }
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

// Single-flight: null results are never memoized (a cached no-op would
// freeze every later render), slot assignment is unconditional once a
// font loads, and invalidation funnels through resetCanvasFont.

const canvasFontSlots: Record<'og' | 'calendar', FontSlot | null> = { og: null, calendar: null }
const canvasFontFlights: Record<'og' | 'calendar', Promise<FontSlot | null> | null> = {
  og: null,
  calendar: null,
}
// Generation per slot: a flight started before the bump must not commit its stale result.
const canvasFontGenerations: Record<'og' | 'calendar', number> = { og: 0, calendar: 0 }
// The family each in-flight load is resolving — a caller pinned to a different
// settings generation must not join (and render with) that family.
const canvasFontFlightFamily: Record<'og' | 'calendar', string | null> = { og: null, calendar: null }

/**
 * `settings` is the caller's PINNED snapshot (request capture / send-time resolve); omitted =
 * the current process snapshot. The family check uses the same bundle the caller renders
 * with, so a settings save mid-request can never swap the font behind a keyed representation.
 */
export function ensureCanvasFont(
  slot: 'og' | 'calendar',
  settings?: BlogSettingsBundle | null,
): Promise<FontSlot | null> {
  const family = requireBlogSettingsSection('fonts', settings)[slot].family
  const cached = canvasFontSlots[slot]
  if (cached !== null) {
    // Cheap sync recheck — a family edit makes the cached slot stale.
    if (cached.family !== family) {
      resetCanvasFont(slot)
    } else if (GlobalFonts.has(cached.family)) {
      // Fast path: font already registered.
      return Promise.resolve(cached)
    }
  }
  let flight = canvasFontFlights[slot]
  if (flight !== null && canvasFontFlightFamily[slot] !== family) {
    // A flight for a different settings generation is in progress — abandon it
    // (the generation guard below keeps its result from committing).
    resetCanvasFont(slot)
    flight = null
  }
  if (flight === null) {
    canvasFontFlightFamily[slot] = family
    const generation = canvasFontGenerations[slot]
    flight = (async () => {
      const loaded = await loadFontSlot(slot, family)
      if (canvasFontGenerations[slot] !== generation) {
        // Abandoned generation: never adopt a newer generation's slot — the
        // caller renders with the fallback font its own key describes.
        return null
      }
      if (loaded !== null) {
        inProcessByPath.set(loaded.path, loaded.buffer)
        if (!GlobalFonts.has(loaded.family)) {
          GlobalFonts.register(loaded.buffer, loaded.family)
        }
        canvasFontSlots[slot] = { buffer: loaded.buffer, family: loaded.family }
      }
      return canvasFontSlots[slot]
    })()
      .catch((err) => {
        // Only the current generation may clear its own flight.
        if (canvasFontGenerations[slot] === generation) {
          canvasFontFlights[slot] = null
          canvasFontFlightFamily[slot] = null
        }
        throw err
      })
      .finally(() => {
        if (canvasFontGenerations[slot] !== generation) {
          // Stale flight — leave newer flights alone.
          return
        }
        const s = canvasFontSlots[slot]
        // Not registered (null slot, snapshot race): drop the flight so the next render retries.
        if (s === null || !GlobalFonts.has(s.family)) {
          canvasFontFlights[slot] = null
          canvasFontFlightFamily[slot] = null
        }
      })
    canvasFontFlights[slot] = flight
  }
  return flight
}

/** The single invalidation seam for canvas fonts (one slot, or all). Every font mutation must call it. */
export function resetCanvasFont(slot?: 'og' | 'calendar'): void {
  if (slot === undefined) {
    canvasFontSlots.og = null
    canvasFontSlots.calendar = null
    canvasFontFlights.og = null
    canvasFontFlights.calendar = null
    canvasFontFlightFamily.og = null
    canvasFontFlightFamily.calendar = null
    canvasFontGenerations.og += 1
    canvasFontGenerations.calendar += 1
    return
  }
  canvasFontSlots[slot] = null
  canvasFontFlights[slot] = null
  canvasFontFlightFamily[slot] = null
  canvasFontGenerations[slot] += 1
}

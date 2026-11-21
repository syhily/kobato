import type { BlogSettingsBundle } from '@kobato/settings/types'

import { FONT_DIR } from '@kobato/server/infra/data-paths'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { GlobalFonts } from '@napi-rs/canvas'
import { Buffer } from 'node:buffer'
import { access, readFile } from 'node:fs/promises'

const log = getLogger('images.assets')

export interface FontSlot {
  buffer: Buffer
  family: string
}

const inProcessByPath = new Map<string, Buffer>()

const loggedEmpty = new Set<'og' | 'calendar'>()
const loggedMissing = new Set<string>()

async function resolveFontPath(slot: 'og' | 'calendar'): Promise<string | null> {
  const ttf = `${FONT_DIR}/${slot}.ttf`
  const otf = `${FONT_DIR}/${slot}.otf`
  try {
    await access(ttf)
    return ttf
  } catch {}
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

const canvasFontSlots: Record<'og' | 'calendar', FontSlot | null> = { og: null, calendar: null }
const canvasFontFlights: Record<'og' | 'calendar', Promise<FontSlot | null> | null> = {
  og: null,
  calendar: null,
}
const canvasFontGenerations: Record<'og' | 'calendar', number> = { og: 0, calendar: 0 }
const canvasFontFlightFamily: Record<'og' | 'calendar', string | null> = { og: null, calendar: null }

export function ensureCanvasFont(
  slot: 'og' | 'calendar',
  settings?: BlogSettingsBundle | null,
): Promise<FontSlot | null> {
  const family = requireBlogSettingsSection('fonts', settings)[slot].family
  const cached = canvasFontSlots[slot]
  if (cached !== null) {
    if (cached.family !== family) {
      resetCanvasFont(slot)
    } else if (GlobalFonts.has(cached.family)) {
      return Promise.resolve(cached)
    }
  }
  let flight = canvasFontFlights[slot]
  if (flight !== null && canvasFontFlightFamily[slot] !== family) {
    resetCanvasFont(slot)
    flight = null
  }
  if (flight === null) {
    canvasFontFlightFamily[slot] = family
    const generation = canvasFontGenerations[slot]
    flight = (async () => {
      const loaded = await loadFontSlot(slot, family)
      if (canvasFontGenerations[slot] !== generation) {
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
        if (canvasFontGenerations[slot] === generation) {
          canvasFontFlights[slot] = null
          canvasFontFlightFamily[slot] = null
        }
        throw err
      })
      .finally(() => {
        if (canvasFontGenerations[slot] !== generation) {
          return
        }
        const s = canvasFontSlots[slot]
        if (s === null || !GlobalFonts.has(s.family)) {
          canvasFontFlights[slot] = null
          canvasFontFlightFamily[slot] = null
        }
      })
    canvasFontFlights[slot] = flight
  }
  return flight
}

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

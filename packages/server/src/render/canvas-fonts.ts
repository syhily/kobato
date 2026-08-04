import { getLogger } from '@kobato/server/infra/logger'
import { FONT_DIR } from '@kobato/server/infra/paths'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { GlobalFonts } from '@napi-rs/canvas'
import { Buffer } from 'node:buffer'
import { access, readFile } from 'node:fs/promises'

// @napi-rs/canvas is statically imported and bundled; under SEA the
// bundler plugin redirects its platform addon load to `nativeRequire`
// (see `scripts/sea/redirect-native-requires.ts`).

// -------- Canvas fonts (`fonts.og` / `fonts.calendar` from settings) --------
//
// Shared by the OG and calendar renderers. TTF/OTF files are uploaded
// through the admin panel and stored under FONT_DIR with fixed filenames
// (`og.{ttf,otf}`, `calendar.{ttf,otf}`); both extensions are probed
// (`.ttf` first). A process-level Map caches the Buffer; uploading a new
// font clears it (`resetFontCache`) plus the registered slot state
// (`resetCanvasFont`) so no restart is needed.
//
// Failure mode is **null, not throw** — a missing or unconfigured font
// must not 500 the OG / calendar route; the renderer skips
// `GlobalFonts.register()` and Canvas falls back to its built-in system
// CJK shaper.

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

interface LoadedFont extends FontSlot {
  path: string
}

async function loadFontSlot(slot: 'og' | 'calendar'): Promise<LoadedFont | null> {
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
    return { buffer: cached, family, path: fullPath }
  }

  try {
    const buffer = await readFile(fullPath)
    // The buffer cache write happens in the caller's generation-guarded
    // commit — caching here would let a load that raced an upload re-enter
    // the OLD bytes behind resetFontCache's back (audit P1-18).
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

// -------- Canvas font single-flight registration --------
//
// Share-in-flight semantics: parallel renders await one Promise, and a
// null result (no family configured, file missing) is never memoized, so
// the next render re-attempts the load. On null we skip
// `GlobalFonts.register` and Canvas falls back to its built-in CJK shaper.
//
// CRITICAL: the flight must NOT memoize the "skipped" path — a cached
// no-op promise would short-circuit every later render and a settings
// edit would only take effect after a process restart. The flight is
// cleared whenever the font is *not* registered after the work runs,
// both on success-but-null and on caught error.
//
// The slot assignment is unconditional once a font loads: gating it on
// `!GlobalFonts.has(...)` would leave the slot null forever when the
// family is already registered (HMR re-registration, or the og and
// calendar slots sharing a family).
//
// Invalidation funnels through `resetCanvasFont`: the font-upload route
// calls it after replacing the file, and the fast path below re-checks
// the configured family on every call so a settings edit takes effect on
// the very next render.

const canvasFontSlots: Record<'og' | 'calendar', FontSlot | null> = { og: null, calendar: null }
const canvasFontFlights: Record<'og' | 'calendar', Promise<FontSlot | null> | null> = {
  og: null,
  calendar: null,
}
// Invalidation generation per slot: `resetCanvasFont` bumps it, and a
// flight started before the bump must not commit its (stale) result —
// otherwise an upload racing an in-flight load re-registers the OLD font
// buffer and caches it until the family changes (audit P1-18).
const canvasFontGenerations: Record<'og' | 'calendar', number> = { og: 0, calendar: 0 }

export function ensureCanvasFont(slot: 'og' | 'calendar'): Promise<FontSlot | null> {
  const cached = canvasFontSlots[slot]
  if (cached !== null) {
    // Settings-family recheck: `requireBlogSettingsSection` is a synchronous
    // in-memory read, so this costs nothing per render. If the admin edited
    // the family (including clearing it to '') the cached slot is stale —
    // drop it and fall through to a fresh load.
    if (requireBlogSettingsSection('fonts')[slot].family !== cached.family) {
      resetCanvasFont(slot)
    } else if (GlobalFonts.has(cached.family)) {
      // Fast path: font already registered. No promise indirection needed.
      return Promise.resolve(cached)
    }
  }
  let flight = canvasFontFlights[slot]
  if (flight === null) {
    const generation = canvasFontGenerations[slot]
    flight = (async () => {
      const loaded = await loadFontSlot(slot)
      if (loaded !== null && canvasFontGenerations[slot] === generation) {
        inProcessByPath.set(loaded.path, loaded.buffer)
        if (!GlobalFonts.has(loaded.family)) {
          GlobalFonts.register(loaded.buffer, loaded.family)
        }
        canvasFontSlots[slot] = { buffer: loaded.buffer, family: loaded.family }
      }
      return canvasFontSlots[slot]
    })()
      .catch((err) => {
        // Only the current generation may clear its own flight — a stale
        // flight erroring must not null out a newer flight's registry
        // entry while that flight is still running.
        if (canvasFontGenerations[slot] === generation) {
          canvasFontFlights[slot] = null
        }
        throw err
      })
      .finally(() => {
        if (canvasFontGenerations[slot] !== generation) {
          // Stale flight: the reset already cleared the registry entry;
          // leave any newer flight alone.
          return
        }
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
 * and any in-flight load for one slot (or all slots without an argument).
 * Any font mutation (upload route, settings-family mismatch, a future
 * delete route) must call it. Tests use it to exercise registration.
 */
export function resetCanvasFont(slot?: 'og' | 'calendar'): void {
  if (slot === undefined) {
    canvasFontSlots.og = null
    canvasFontSlots.calendar = null
    canvasFontFlights.og = null
    canvasFontFlights.calendar = null
    canvasFontGenerations.og += 1
    canvasFontGenerations.calendar += 1
    return
  }
  canvasFontSlots[slot] = null
  canvasFontFlights[slot] = null
  canvasFontGenerations[slot] += 1
}

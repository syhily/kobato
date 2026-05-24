import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import LogoDarkSvg from '@/assets/logos/logo-dark.svg?raw'
import LogoLightSvg from '@/assets/logos/logo.svg?raw'
import { FONT_PATH } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/blog'

// Logo SVGs are inlined into the server bundle via Vite's built-in
// `?raw` query — 19 KB of text each, OG-card composition needs them
// at first render. The browser fetches `public/logo-dark.svg` (which
// still exists for the public Header / BrandLogo) — only the server
// reads from `@/assets/logos/` for Canvas use. This used to go
// through the project's custom `vite-plugin-binary` (z85 + gzip
// embedding); `?raw` covers the same ground with zero plugin.
const LogoDarkBuffer = Buffer.from(LogoDarkSvg, 'utf8')
const LogoLightBuffer = Buffer.from(LogoLightSvg, 'utf8')

export function logoDark(): Buffer {
  return LogoDarkBuffer
}

export function logoLight(): Buffer {
  return LogoLightBuffer
}

// -------- Canvas fonts (`fonts.og` / `fonts.calendar` from settings) --------
//
// TTF/OTF files live on the local filesystem under the directory
// configured by the `FONT_PATH` environment variable. The admin
// specifies a filename relative to that directory and a font-family
// name in `/admin/settings/fonts`.
//
// A single process-level Map caches the Buffer so repeated renders
// don't re-read disk. The key is the resolved absolute path; changing
// the setting (or replacing the file on disk) requires a process
// restart to pick up the new font. This is acceptable because fonts
// change far less frequently than settings, and Docker deployments are
// immutable.
//
// Failure mode is **null, not throw**. An admin who hasn't configured
// the path, or a missing file, must NOT 500 the OG / calendar route.
// The renderer skips `GlobalFonts.register()` for null buffers and
// Canvas falls back to its built-in system CJK shaper.

const log = getLogger('images.assets')

export interface FontSlot {
  buffer: Buffer
  family: string
}

const inProcessByPath = new Map<string, Buffer>()

async function loadFontSlot(slot: 'og' | 'calendar'): Promise<FontSlot | null> {
  const fonts = requireBlogSettingsSection('fonts')
  const relativePath = fonts[slot].path
  const family = fonts[slot].family
  if (relativePath === '' || family === '') {
    if (!loggedEmpty.has(slot)) {
      log.info('Canvas font slot has no path/family configured; using fallback system font', { slot })
      loggedEmpty.add(slot)
    }
    return null
  }
  loggedEmpty.delete(slot)

  if (!FONT_PATH) {
    if (!loggedUnset.has(slot)) {
      log.info('FONT_PATH is not set; using fallback system font', { slot })
      loggedUnset.add(slot)
    }
    return null
  }
  loggedUnset.delete(slot)

  const basePath = path.resolve(FONT_PATH)
  const fullPath = path.resolve(basePath, relativePath)

  // Path-traversal guard: the resolved path must stay inside FONT_PATH.
  const relativeToBase = path.relative(basePath, fullPath)
  if (relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase)) {
    log.warn('Canvas font path escapes FONT_PATH directory; rejecting', { slot, relativePath, fullPath })
    return null
  }

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

// Deduplicates the "no path configured" / "FONT_PATH unset" / "file missing"
// logs so operators see them once per replica, not on every render.
const loggedEmpty = new Set<'og' | 'calendar'>()
const loggedUnset = new Set<'og' | 'calendar'>()
const loggedMissing = new Set<string>()

export function oppoSans(): Promise<FontSlot | null> {
  return loadFontSlot('og')
}

export function oppoSerif(): Promise<FontSlot | null> {
  return loadFontSlot('calendar')
}

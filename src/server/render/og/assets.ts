import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import LogoDarkSvg from '@/assets/logos/logo-dark.svg?raw'
import LogoLightSvg from '@/assets/logos/logo.svg?raw'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { loadBuffer } from '@/server/infra/redis/buffer-cache'
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
// The TTFs used by `@napi-rs/canvas` (`og.ts` + `calendar.ts`) used to
// live in the repo as `?binary` imports; the binary then sat embedded
// in the server bundle as a ~60 MB z85+gzip string. They now live on a
// CDN and the URL is admin-configurable at `/admin/settings/fonts`.
//
// Three layers of caching protect the SSR hot path:
//
//   1. Process Map (`inProcessByUrl`) — keyed by URL so a settings
//      rotation doesn't return a stale Buffer. Hit = zero I/O.
//   2. Redis via `loadBuffer` — shared between replicas, TTL 30 days
//      (effectively forever); URL-hash key auto-invalidates on rotate.
//   3. CDN `fetch` — only on a cold replica after a Redis flush.
//
// Failure mode is **null, not throw**. An admin who hasn't configured
// the URL, or a CDN outage, must NOT 500 the OG / calendar route. The
// renderer skips `GlobalFonts.register()` for null buffers and Canvas
// falls back to its built-in system CJK shaper.

const log = getLogger('images.assets')

const FONT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const FONT_MAX_BYTES = 100 * 1024 * 1024 // 100 MB hard cap

const inProcessByUrl = new Map<string, Buffer>()

async function fetchFontBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new DomainError('INTERNAL', `HTTP ${res.status}`)
  }
  const contentLength = Number(res.headers.get('content-length') ?? '0')
  if (contentLength > FONT_MAX_BYTES) {
    throw new DomainError('INTERNAL', `Content-Length ${contentLength} exceeds ${FONT_MAX_BYTES}`)
  }
  const arrayBuf = await res.arrayBuffer()
  if (arrayBuf.byteLength > FONT_MAX_BYTES) {
    throw new DomainError('INTERNAL', `Downloaded ${arrayBuf.byteLength} bytes exceeds ${FONT_MAX_BYTES}`)
  }
  return Buffer.from(arrayBuf)
}

async function loadFontSlot(slot: 'og' | 'calendar'): Promise<Buffer | null> {
  const fonts = requireBlogSettingsSection('fonts')
  const url = fonts[slot].url
  if (url === '') {
    // Common misconfiguration on fresh installs: paste-the-URL-later
    // story. Single info log per cold replica so the operator can
    // tell from logs that the font slot is unconfigured rather than
    // failing — `ogFontReady` in og.ts intentionally retries every
    // request, but we don't want to log on each retry.
    if (!loggedEmpty.has(slot)) {
      log.info('Canvas font slot has no URL configured; using fallback system font', { slot })
      loggedEmpty.add(slot)
    }
    return null
  }
  loggedEmpty.delete(slot)
  const inProcess = inProcessByUrl.get(url)
  if (inProcess !== undefined) {
    return inProcess
  }
  try {
    const key = `fonts:cache:${createHash('sha256').update(url).digest('hex')}`
    const buffer = await loadBuffer(key, () => fetchFontBuffer(url), FONT_CACHE_TTL_SECONDS)
    inProcessByUrl.set(url, buffer)
    log.info('Loaded Canvas font slot', { slot, url, bytes: buffer.byteLength })
    return buffer
  } catch (err) {
    log.warn('Failed to load Canvas font slot', {
      slot,
      url,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// Deduplicates the "no URL configured" log so operators see it once
// per replica, not on every render. Re-armed when a URL gets pasted
// (cleared on the first successful resolve).
const loggedEmpty = new Set<'og' | 'calendar'>()

export function oppoSans(): Promise<Buffer | null> {
  return loadFontSlot('og')
}

export function oppoSerif(): Promise<Buffer | null> {
  return loadFontSlot('calendar')
}

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { Buffer } from 'node:buffer'

import { findEmailById } from '@/server/infra/db/operations/user'
import { compressImage, imageWidth } from '@/server/infra/image/compress'
import { getLogger } from '@/server/infra/logger'
import { safeFetch } from '@/server/infra/safe-fetch'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { DEFAULT_AVATAR_SIZE } from '@/shared/utils/avatar'
import { idFromString } from '@/shared/utils/id'
import { isAllowedMirrorUrl } from '@/shared/utils/safe-url'
import { encodedEmail } from '@/shared/utils/security'
import { isNumeric } from '@/shared/utils/tools'
import { joinUrl } from '@/shared/utils/urls'

// Avatar-fetch domain service. Lifted out of `src/routes/image.avatar.ts`
// per the route-orchestration rule: route modules should orchestrate
// (parse → service → DTO → respond) and not embed business logic. The
// route now only needs to ask "fetch the canonical PNG buffer for this
// id/hash" and let this module handle gravatar mirror redirects, the
// "no-avatar" fallback, and id ↔ email-hash translation.

const MAX_REDIRECT_HOPS = 5
const FETCH_TIMEOUT_MS = 30_000

// Bounds for the endpoint's `?s=` parameter — the range the Gravatar and QQ
// upstreams usefully serve (the retired `comments.avatar.size` setting
// validated the same window).
const MIN_AVATAR_SIZE = 16
const MAX_AVATAR_SIZE = 512

/** Resolve the avatar endpoint's `?s=` query parameter: an integer clamped
 *  to [16, 512], defaulting to DEFAULT_AVATAR_SIZE when the parameter is
 *  absent, blank, or not a finite number. */
export function resolveAvatarSize(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_AVATAR_SIZE
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AVATAR_SIZE
  }
  return Math.min(MAX_AVATAR_SIZE, Math.max(MIN_AVATAR_SIZE, Math.trunc(parsed)))
}

/** Default-avatar URL on this site, used both as the loader fallback and
 *  as the gravatar `d=` sentinel. */
export function defaultAvatarUrl(): string {
  return joinUrl(requireBlogSettingsSection('siteIdentity').website, '/images/default-avatar.png')
}

function fetchErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'fetch failed'
}

interface SafeFetchOptions {
  headers?: Record<string, string>
  allowRedirect?: boolean
}

/** Fetch avatar image bytes with bounded redirects and consistent error
 *  handling — the SSRF guard, manual-redirect loop, and timeout are owned
 *  by `@/server/infra/safe-fetch`. Returns `null` on any failure so the
 *  route can fall back to the default avatar. */
async function safeFetchAvatar(
  label: 'avatar' | 'avatar.qq',
  initialLink: string,
  options: SafeFetchOptions = {},
): Promise<ArrayBuffer | null> {
  const { headers, allowRedirect = true } = options
  const result = await safeFetch(initialLink, {
    timeoutMs: FETCH_TIMEOUT_MS,
    maxRedirects: allowRedirect ? MAX_REDIRECT_HOPS : 0,
    headers,
    // A redirect back to our own default avatar is the mirror's
    // "no avatar" signal — veto the hop before we fetch ourselves.
    shouldFollowRedirect: (nextUrl) => nextUrl.toString() !== defaultAvatarUrl(),
  })
  if (result.ok) {
    return result.body
  }
  if (result.reason === 'fetch-failed' || result.reason === 'timeout') {
    // Network-level failures (ETIMEDOUT, ECONNREFUSED, DNS failures,
    // aborts) should degrade to the default avatar instead of 500ing
    // the whole route. Log only the message — URLs / emails are user data
    // and must not be emitted.
    getLogger(label).warn('avatar fetch failed', { error: fetchErrorMessage(result.error) })
  } else if (result.reason === 'blocked-host' || result.reason === 'bad-protocol') {
    // A malicious / compromised mirror 302d us toward an internal address.
    getLogger(label).warn('avatar redirect target rejected by ssrf guard')
  }
  return null
}

/** Fetch the avatar PNG bytes from the configured gravatar mirror at the
 *  requested pixel size. Returns `null` when the mirror reports "no avatar"
 *  (either via 4xx, via a redirect back to the default-avatar URL, after the
 *  redirect budget is exhausted, or when the upstream network call fails) —
 *  and also when the 200 payload is narrower than the requested size or not
 *  a decodable image at all. Gravatar-protocol mirrors always serve exactly
 *  the requested size (gravatar upscales smaller originals), so an
 *  undersized inline payload is the mirror's "unknown hash" placeholder
 *  served as 200 instead of a `d=` redirect (loli.net style); caching it
 *  would poison that size bucket with a 24px globe for the full TTL.
 *  The buffer is compressed before being handed back so the cache layer
 *  stores the smaller payload. */
export async function fetchAvatarImage(hash: string, size: number): Promise<Buffer | null> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const comments = requireBlogSettingsSection('comments')
  // SSRF guard: reject mirror URLs that are not on the gravatar allowlist
  // before we ever issue a fetch. Do NOT log the offending URL — it may
  // contain the internal hostname an admin (or attacker) is probing.
  if (!isAllowedMirrorUrl(comments.comments.avatar.mirror)) {
    getLogger('avatar').warn('avatar mirror url rejected by ssrf guard')
    return null
  }
  const defaultLink = defaultAvatarUrl()
  const initialLink = joinUrl(comments.comments.avatar.mirror, `${hash}?s=${size}&d=${encodeURIComponent(defaultLink)}`)
  const headers: Record<string, string> = {
    Accept: 'image/png',
    Referer: siteIdentity.website,
  }

  const body = await safeFetchAvatar('avatar', initialLink, { headers, allowRedirect: true })
  if (body === null) {
    return null
  }
  const buffer = Buffer.from(body)
  const width = await imageWidth(buffer)
  if (width === undefined || width < size) {
    return null
  }
  return compressImage(buffer)
}

const QQ_EMAIL_RE = /^\d+@qq\.com$/i

export function isQQEmail(email: string): boolean {
  return QQ_EMAIL_RE.test(email.trim())
}

export function getQQAvatarUrl(email: string, size: number): string | null {
  const match = email
    .trim()
    .toLowerCase()
    .match(/^(\d+)@qq\.com$/)
  if (!match) {
    return null
  }
  // qlogo only serves fixed sizes (spec=4 → 100×100, spec=5 → 640×640).
  // Pick the smallest spec that still covers the requested size so comments
  // never upscale a low-res payload.
  const spec = size > 100 ? 5 : 4
  return `https://q.qlogo.cn/headimg_dl?dst_uin=${match[1]}&spec=${spec}`
}

/** Fetch the avatar PNG bytes from the QQ avatar CDN at the requested pixel
 *  size. Returns `null` when the request fails. The buffer is compressed
 *  before being handed back so the cache layer stores the smaller payload. */
export async function fetchQQAvatarImage(email: string, size: number): Promise<Buffer | null> {
  const url = getQQAvatarUrl(email, size)
  if (url === null) {
    return null
  }

  const body = await safeFetchAvatar('avatar.qq', url, {
    headers: { Accept: 'image/png,image/jpeg,image/webp,*/*' },
    allowRedirect: false,
  })
  if (body === null) {
    return null
  }
  return compressImage(Buffer.from(body))
}

/** Translate the route param into the canonical cache key and, when the
 *  param is a numeric user id, also return the original email address.
 *  The route accepts both numeric user ids (issued by `findAvatar`) and
 *  the pre-encoded email hash gravatar expects. Numeric ids are looked
 *  up in the user table; missing users resolve to `null` so the route
 *  can short-circuit to a "no avatar" cache entry without hitting any
 *  external mirror at all. */
export async function resolveAvatarInfo(
  db: NodePgDatabase,
  rawHash: string,
): Promise<{ email: string | null; hash: string | null }> {
  if (isNumeric(rawHash)) {
    const email = await findEmailById(db, idFromString(rawHash))
    if (email === null) {
      return { email: null, hash: null }
    }
    return { email, hash: await encodedEmail(email) }
  }
  return { email: null, hash: rawHash }
}

// ─── Site-owner GitHub avatar ────────────────────────────────────────────

const GITHUB_AVATAR_URL = 'https://avatars.githubusercontent.com/u/1761698?s=32'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/** Fetch the site owner's GitHub avatar and inline it as a base64 data URL
 *  so the client never makes a cross-origin request (lifted out of
 *  `github.controller.ts`, following the `fetchLatestRelease` precedent).
 *  The avatar is decorative — any upstream failure resolves to an empty
 *  string instead of an error. The URL is a compile-time constant, so a
 *  plain `fetch` (no SSRF guard) is sufficient. */
export async function fetchGithubAvatarDataUrl(): Promise<string> {
  const res = await fetch(GITHUB_AVATAR_URL, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) {
    return ''
  }
  const buffer = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'image/png'
  return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
}

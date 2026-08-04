import type { Database } from '@kobato/server/infra/db/database'

import { type AvatarEntry, AvatarStatus, get, set, through } from '@kobato/server/infra/cache/registry'
import { findEmailById } from '@kobato/server/infra/db/operations/user'
import { compressImage, imageWidth } from '@kobato/server/infra/image/compress'
import { getLogger } from '@kobato/server/infra/logger'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { DEFAULT_AVATAR_SIZE } from '@kobato/shared/utils/avatar'
import { idFromString } from '@kobato/shared/utils/id'
import { isAllowedMirrorUrl } from '@kobato/shared/utils/safe-url'
import { encodedEmail } from '@kobato/shared/utils/security'
import { isNumeric } from '@kobato/shared/utils/tools'
import { joinUrl } from '@kobato/shared/utils/urls'
import { Buffer } from 'node:buffer'

// Avatar-fetch domain service. The HTTP resource only asks "fetch the
// canonical PNG buffer for this id/hash"; this module owns the gravatar
// mirror redirects, the "no-avatar" fallback, and id ↔ email-hash
// translation.

const MAX_REDIRECT_HOPS = 5
const FETCH_TIMEOUT_MS = 30_000

// Bounds for the endpoint's `?s=` parameter — the range the Gravatar and QQ
// upstreams usefully serve (the retired `comments.avatar.size` setting
// validated the same window).
const MIN_AVATAR_SIZE = 16
const MAX_AVATAR_SIZE = 512

// Fixed size buckets for the avatar cache key. Every cache entry (and every
// upstream mirror fetch) is keyed `{ size, email }`, so an arbitrary `?s=`
// would hand each requested pixel size its own entry — a cache-key
// explosion an attacker can trigger with a loop. The clamped size rounds UP
// to the nearest bucket (upscaling the upstream request is harmless:
// gravatar-protocol mirrors serve exactly the requested size).
const AVATAR_SIZE_BUCKETS = [32, 64, 128, 256] as const

function bucketAvatarSize(size: number): number {
  for (const bucket of AVATAR_SIZE_BUCKETS) {
    if (size <= bucket) {
      return bucket
    }
  }
  return AVATAR_SIZE_BUCKETS[AVATAR_SIZE_BUCKETS.length - 1]
}

/** The bucket the site-wide default (DEFAULT_AVATAR_SIZE) lands in — the
 *  size the QQ pre-warm writes so the read-through branch actually hits it. */
export const DEFAULT_AVATAR_SIZE_BUCKET = bucketAvatarSize(DEFAULT_AVATAR_SIZE)

/** Resolve the avatar endpoint's `?s=` query parameter: an integer clamped
 *  to [16, 512] and rounded up to the nearest cache bucket, defaulting to
 *  DEFAULT_AVATAR_SIZE's bucket when the parameter is absent, blank, or not
 *  a finite number. */
export function resolveAvatarSize(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_AVATAR_SIZE_BUCKET
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AVATAR_SIZE_BUCKET
  }
  return bucketAvatarSize(Math.min(MAX_AVATAR_SIZE, Math.max(MIN_AVATAR_SIZE, Math.trunc(parsed))))
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

/** Find-or-fetch-and-cache for the find-avatar procedure. Returns the
 *  canonical email hash the avatar endpoint is keyed on. When the email
 *  is a QQ email the cache is pre-warmed at DEFAULT_AVATAR_SIZE_BUCKET —
 *  the size the endpoint's default `?s=` resolves to after bucketing, so
 *  the URL the controller builds from the returned hash hits the warm
 *  entry — recording either the fetched bytes (HAVE_AVATAR) or a negative
 *  entry (NO_AVATAR) when the upstream has no avatar. Non-QQ emails leave
 *  the cache alone: the avatar endpoint fetches from the gravatar mirror
 *  lazily per requested size.
 *
 *  The pre-warm honors the same read-through policy as `serveAvatar`: it
 *  only fetches after a cache miss. Any existing entry is final — a
 *  still-cached HAVE_AVATAR entry must never be shadowed by a negative
 *  written off a transient QQ CDN failure (audit V3-03), and re-fetching
 *  on every hit would amplify one upstream request per comment-editor
 *  load. */
export async function resolveAvatarForEmail(db: Database, email: string): Promise<string> {
  const hash = await encodedEmail(email)
  if (isQQEmail(email)) {
    const cached = await get<'avatar', AvatarEntry>(db, 'avatar', { size: DEFAULT_AVATAR_SIZE_BUCKET, email: hash })
    if (cached === null) {
      const buffer = await fetchQQAvatarImage(email, DEFAULT_AVATAR_SIZE_BUCKET)
      await set(
        db,
        'avatar',
        { size: DEFAULT_AVATAR_SIZE_BUCKET, email: hash },
        buffer === null
          ? { status: AvatarStatus.NO_AVATAR, buffer: null }
          : { status: AvatarStatus.HAVE_AVATAR, buffer },
      )
    }
  }
  return hash
}

/** Translate the route param into the canonical cache key and, when the
 *  param is a numeric user id, also return the original email address.
 *  The route accepts both numeric user ids (issued by `findAvatar`) and
 *  the pre-encoded email hash gravatar expects. Numeric ids are looked
 *  up in the user table; missing users resolve to `null` so the route
 *  can short-circuit to a "no avatar" cache entry without hitting any
 *  external mirror at all. */
export async function resolveAvatarInfo(
  db: Database,
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

// ─── Avatar serving ──────────────────────────────────────────────────────

/** The outcome of serving one `/images/avatar/:filename.png` request:
 *  either the PNG bytes to respond with, or `redirect` — the caller sends
 *  the requester to `defaultAvatarUrl()`. */
export type ServedAvatar = { kind: 'png'; buffer: Buffer } | { kind: 'redirect' }

// The gravatar-protocol email hash the mirror branch is keyed on is a hex
// digest — md5 (32) historically, sha256 (64) is what `encodedEmail`
// issues. Anything else can never resolve upstream, so it is rejected
// before it becomes a cache key or an outbound mirror request.
const EMAIL_HASH_RE = /^([a-f0-9]{32}|[a-f0-9]{64})$/i

/** The avatar endpoint's entire serving policy, sunk out of the HTTP
 *  resource: id/hash translation, the negative-cache writes, and the
 *  read-through branches for both the QQ CDN and the gravatar mirror.
 *  Every cache entry is keyed `{ size, email }` and written exactly once
 *  per path.
 *
 *  Read-through policy — identical for QQ and gravatar (audit P1-27):
 *  a cached entry (positive or negative) serves directly; a miss fetches
 *  upstream once and records the outcome. Both fetch helpers collapse
 *  every failure mode (4xx, redirect, network error, undecodable or
 *  undersized payload) into `null`, and any `null` is recorded as a
 *  negative entry under the same bucket TTL as a positive one — a
 *  negative is only ever written after a cache miss, so a transient
 *  upstream failure can never shadow a still-cached positive entry.
 *  Concurrent reads of the same email coalesce inside the cache module,
 *  so a hot avatar (e.g. the site owner appearing in every comment
 *  thread) only round-trips kv_cache once per concurrent burst instead
 *  of once per requesting comment. */
export async function serveAvatar(db: Database, hash: string, size: number): Promise<ServedAvatar> {
  if (!isNumeric(hash) && !EMAIL_HASH_RE.test(hash)) {
    // Neither a user id nor a hex email hash. Redirect WITHOUT writing a
    // negative cache entry — an attacker spraying garbage hashes must not
    // be able to grow kv_cache or trigger mirror fetches.
    return { kind: 'redirect' }
  }
  const { email, hash: canonical } = await resolveAvatarInfo(db, hash)
  if (canonical === null) {
    // Numeric id with no user row — no upstream to ask, record the
    // negative under the raw param so repeats short-circuit.
    await set(db, 'avatar', { size, email: hash }, { status: AvatarStatus.NO_AVATAR, buffer: null })
    return { kind: 'redirect' }
  }

  const cached = await get<'avatar', AvatarEntry>(db, 'avatar', { size, email: canonical })
  if (cached !== null) {
    if (cached.status === AvatarStatus.NO_AVATAR) {
      return { kind: 'redirect' }
    }
    if (cached.buffer !== null) {
      return { kind: 'png', buffer: cached.buffer }
    }
  }

  const buffer =
    email !== null && isQQEmail(email) ? await fetchQQAvatarImage(email, size) : await fetchAvatarImage(canonical, size)
  if (buffer === null) {
    await set(db, 'avatar', { size, email: canonical }, { status: AvatarStatus.NO_AVATAR, buffer: null })
    return { kind: 'redirect' }
  }
  await set(db, 'avatar', { size, email: canonical }, { status: AvatarStatus.HAVE_AVATAR, buffer })
  return { kind: 'png', buffer }
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
 *  so the client never makes a cross-origin request. The avatar is
 *  decorative — any upstream failure resolves to an empty string instead
 *  of an error. The URL is a compile-time constant, so a plain `fetch`
 *  (no SSRF guard) is sufficient.
 *
 *  Served through the `githubAvatar` kv bucket (short TTL): an uncached
 *  call costs up to 30s of upstream-timeout per fresh session, while a
 *  cached one is a kv read. Failures (`''`) are never cached — the
 *  bucket's `cacheWhen` drops them so the next request retries. */
export async function fetchGithubAvatarDataUrl(db: Database): Promise<string> {
  return through(db, 'githubAvatar', {}, async () => {
    const res = await fetch(GITHUB_AVATAR_URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) {
      return ''
    }
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/png'
    return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
  })
}

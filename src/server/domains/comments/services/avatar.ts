import { Buffer } from 'node:buffer'

import type { Database } from '@/server/infra/db/database'

import { type AvatarEntry, AvatarStatus, get, set, through } from '@/server/infra/cache/registry'
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

// Avatar-fetch domain service: gravatar/QQ mirror redirects, the no-avatar
// fallback, and id ↔ email-hash translation.

const MAX_REDIRECT_HOPS = 5
const FETCH_TIMEOUT_MS = 30_000

// Clamp for `?s=` — the range the Gravatar/QQ upstreams serve.
const MIN_AVATAR_SIZE = 16
const MAX_AVATAR_SIZE = 512

// Cache keys include `size`; fixed buckets stop a per-pixel cache-key
// explosion. Rounds up — gravatar mirrors serve exactly the requested size.
const AVATAR_SIZE_BUCKETS = [32, 64, 128, 256] as const

function bucketAvatarSize(size: number): number {
  for (const bucket of AVATAR_SIZE_BUCKETS) {
    if (size <= bucket) {
      return bucket
    }
  }
  return AVATAR_SIZE_BUCKETS[AVATAR_SIZE_BUCKETS.length - 1]
}

/** Bucket the site-wide default lands in — the QQ pre-warm writes this size. */
export const DEFAULT_AVATAR_SIZE_BUCKET = bucketAvatarSize(DEFAULT_AVATAR_SIZE)

/** Resolve `?s=`: clamp to [16, 512], round up to a cache bucket; absent/blank/non-finite → default bucket. */
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

/** Bounded redirects/timeout via safe-fetch; returns `null` on any failure. */
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
    // A redirect to our own default avatar is the mirror's "no avatar" signal.
    shouldFollowRedirect: (nextUrl) => nextUrl.toString() !== defaultAvatarUrl(),
  })
  if (result.ok) {
    return result.body
  }
  if (result.reason === 'fetch-failed' || result.reason === 'timeout') {
    // Network failures degrade to the default avatar. Log only the message —
    // URLs/emails are user data and must not be emitted.
    getLogger(label).warn('avatar fetch failed', { error: fetchErrorMessage(result.error) })
  } else if (result.reason === 'blocked-host' || result.reason === 'bad-protocol') {
    getLogger(label).warn('avatar redirect target rejected by ssrf guard')
  }
  return null
}

/** Avatar PNG at `size`, else `null`: no-avatar signals (4xx, redirect,
 *  budget, network) or an undersized 200 payload (placeholder — never cached). */
export async function fetchAvatarImage(hash: string, size: number): Promise<Buffer | null> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const comments = requireBlogSettingsSection('comments')
  // SSRF guard: reject mirror URLs not on the gravatar allowlist.
  // Never log the offending URL — it may be an internal hostname.
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
  const match = /^(\d+)@qq\.com$/.exec(email.trim().toLowerCase())
  if (!match) {
    return null
  }
  // qlogo serves only fixed sizes (spec=4=100px, spec=5=640px); pick the smallest covering `size`.
  const spec = size > 100 ? 5 : 4
  return `https://q.qlogo.cn/headimg_dl?dst_uin=${match[1]}&spec=${spec}`
}

/** Fetch the QQ avatar PNG at the requested size; `null` on failure.
 *  Compressed before caching so the cache layer stores the smaller payload. */
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

/** Canonical email hash; QQ emails pre-warm at DEFAULT_AVATAR_SIZE_BUCKET
 *  with a positive/negative entry, fetched only on miss (entries are final, audit V3-03). */
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

/** Numeric ids resolve via the user table to their email; anything else is
 *  the pre-encoded hash. Missing users → null (no mirror hit). */
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

/** Outcome of one `/images/avatar/:filename.png` request: PNG bytes, or
 *  `redirect` — the caller sends the requester to `defaultAvatarUrl()`. */
export type ServedAvatar = { kind: 'png'; buffer: Buffer } | { kind: 'redirect' }

// Only md5 (32) / sha256 (64) hex digests can resolve on gravatar mirrors.
const EMAIL_HASH_RE = /^([a-f0-9]{32}|[a-f0-9]{64})$/i

/** Serving policy: cached entries serve directly; a miss fetches once and
 *  records the outcome — negatives are written only on miss (audit P1-27). */
export async function serveAvatar(db: Database, hash: string, size: number): Promise<ServedAvatar> {
  if (!isNumeric(hash) && !EMAIL_HASH_RE.test(hash)) {
    // Neither id nor hash — redirect without caching, so garbage can't grow kv_cache.
    return { kind: 'redirect' }
  }
  const { email, hash: canonical } = await resolveAvatarInfo(db, hash)
  if (canonical === null) {
    // No user row — record the negative under the raw param so repeats short-circuit.
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

const GITHUB_AVATAR_URL = 'https://avatars.githubusercontent.com/u/1761698?s=32'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/** Owner's GitHub avatar as an inline base64 data URL (no cross-origin
 *  request); any failure → `''`. Cached via the `githubAvatar` bucket. */
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

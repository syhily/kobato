import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { Buffer } from 'node:buffer'

import { findEmailById } from '@/server/domains/users/services/admin'
import { getLogger } from '@/server/infra/logger'
import { compressImage } from '@/server/render/image-compress'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'
import { isAllowedMirrorUrl, isBlockedFetchHost } from '@/shared/utils/safe-url'
import { encodedEmail } from '@/shared/utils/security'
import { isNumeric } from '@/shared/utils/tools'
import { joinUrl } from '@/shared/utils/urls'

// Avatar-fetch domain service. Lifted out of `src/routes/image.avatar.ts`
// per the route-orchestration rule: route modules should orchestrate
// (parse → service → DTO → respond) and not embed business logic. The
// route now only needs to ask "fetch the canonical PNG buffer for this
// id/hash" and let this module handle gravatar mirror redirects, the
// "no-avatar" fallback, and id ↔ email-hash translation.

// Some Gravatar mirrors answer with a 302 to a sized / CDN variant
// rather than streaming the bytes inline. We therefore inspect the
// first response with `redirect: 'manual'`: if the mirror is bouncing
// us back to the default avatar URL we passed via `d=`, treat it as
// "no avatar"; otherwise follow the redirect chain ourselves so the
// cached payload is the real image rather than the empty 302 body.
const MAX_REDIRECT_HOPS = 5

/** Default-avatar URL on this site, used both as the loader fallback and
 *  as the gravatar `d=` sentinel. */
export function defaultAvatarUrl(): string {
  return joinUrl(requireBlogSettingsSection('siteIdentity').website, '/images/default-avatar.png')
}

/** Fetch the avatar PNG bytes from the configured gravatar mirror.
 *  Returns `null` when the mirror reports "no avatar" (either via 4xx,
 *  via a redirect back to the default-avatar URL, after the redirect
 *  budget is exhausted, or when the upstream network call fails). The
 *  buffer is compressed before being handed back so the cache layer
 *  stores the smaller payload. */
export async function fetchAvatarImage(hash: string): Promise<Buffer | null> {
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
  const initialLink = joinUrl(
    comments.comments.avatar.mirror,
    `${hash}?s=${comments.comments.avatar.size}&d=${encodeURIComponent(defaultLink)}`,
  )
  const headers: Record<string, string> = {
    Accept: 'image/png',
    Referer: siteIdentity.website,
  }

  let currentLink = initialLink
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let resp: Response
    try {
      resp = await fetch(currentLink, { redirect: 'manual', headers, signal: AbortSignal.timeout(30_000) })
    } catch (err) {
      // Network-level failures (ETIMEDOUT, ECONNREFUSED, DNS failures,
      // aborts) should degrade to the default avatar instead of 500ing
      // the whole route. Do not log the URL/hash — they are user data.
      getLogger('avatar').warn('avatar fetch failed', { error: err })
      return null
    }

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location')
      if (location === null) {
        return null
      }
      const nextUrl = new URL(location, currentLink)
      const nextLink = nextUrl.toString()
      if (nextLink === defaultLink) {
        return null
      }
      // SSRF guard: a malicious / compromised mirror can 302 us toward an
      // internal address. Re-validate every hop, not just the initial URL.
      if ((nextUrl.protocol !== 'https:' && nextUrl.protocol !== 'http:') || isBlockedFetchHost(nextUrl.hostname)) {
        getLogger('avatar').warn('avatar redirect target rejected by ssrf guard')
        return null
      }
      currentLink = nextLink
      continue
    }

    if (resp.status > 299) {
      return null
    }

    return compressImage(Buffer.from(await resp.arrayBuffer()))
  }

  return null
}

const QQ_EMAIL_RE = /^\d+@qq\.com$/i

export function isQQEmail(email: string): boolean {
  return QQ_EMAIL_RE.test(email.trim())
}

export function getQQAvatarUrl(email: string): string | null {
  const match = email
    .trim()
    .toLowerCase()
    .match(/^(\d+)@qq\.com$/)
  if (!match) {
    return null
  }
  return `https://q.qlogo.cn/headimg_dl?dst_uin=${match[1]}&spec=4`
}

/** Fetch the avatar PNG bytes from the QQ avatar CDN.
 *  Returns `null` when the request fails. The buffer is compressed
 *  before being handed back so the cache layer stores the smaller payload. */
export async function fetchQQAvatarImage(email: string): Promise<Buffer | null> {
  const url = getQQAvatarUrl(email)
  if (url === null) {
    return null
  }

  let resp: Response
  try {
    resp = await fetch(url, {
      headers: { Accept: 'image/png,image/jpeg,image/webp,*/*' },
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    // Network-level failures should degrade to the default avatar instead
    // of 500ing the route. Do not log the URL/email — they are user data.
    getLogger('avatar').warn('qq avatar fetch failed', { error: err })
    return null
  }
  if (!resp.ok) {
    return null
  }

  return compressImage(Buffer.from(await resp.arrayBuffer()))
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

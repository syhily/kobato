import { createHash } from 'node:crypto'

import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { getLogger } from '@/server/infra/logger'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('rate-limit')

// Rate limiting is fully in-process: a module-level Map of fixed-window
// counters, one entry per key. There is no external store, so the old
// fail-closed failure mode (Redis down → every login denied) is gone —
// the limiter simply cannot fail. Two deliberate trade-offs:
//
//   - Counters reset on process restart. A bounced deploy re-arms every
//     window; acceptable for the single-process self-host target and far
//     better than coupling login availability to a cache service.
//   - Multi-instance deployments do not share counters. The project
//     already assumes a single process.
//
// Keys keep the historical reserved `rate-limit:` namespace (see
// `RESERVED_CACHE_PREFIXES` in `@/server/domains/settings/sections/cache`)
// so key shapes stay stable for any key-level diagnostics.
const RATE_LIMIT_NAMESPACE = 'rate-limit:'

const signInKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}signin:${ip}`
const inviteKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}invite:${ip}`
const passwordResetKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}password-reset:${ip}`
const passwordResetTargetKey = (userId: bigint) => `${RATE_LIMIT_NAMESPACE}password-reset-target:${userId.toString()}`
const commentPostIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}comment-post:${ip}`

// Hash the email so the raw address never lands in the counter map.
// SHA-256 truncated to 32 hex chars (128 bits) is more than enough
// collision resistance for a per-window counter.
function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

const commentPostEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}comment-email:${hashEmail(email)}`
const inviteEmailKey = (adminId: bigint, email: string) =>
  `${RATE_LIMIT_NAMESPACE}invite-email:${adminId.toString()}:${hashEmail(email)}`
const passwordResetEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}password-reset-email:${hashEmail(email)}`
const likeIncreaseKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}like-increase:${ip}`
const otpSendIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}otp-send:${ip}`
const otpSendEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}otp-send-email:${hashEmail(email)}`
const otpVerifyIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}otp-verify:${ip}`
const otpVerifyEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}otp-verify-email:${hashEmail(email)}`
const passkeyAuthBeginIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-auth-begin:${ip}`
const passkeyAuthFinishIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-auth-finish:${ip}`
const passkeyRegisterBeginIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-register-begin:${ip}`
const passkeyRegisterFinishIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-register-finish:${ip}`
const passkeySetForceIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-set-force:${ip}`
const passkeyDeleteIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-delete:${ip}`

// Conservative fallbacks used ONLY when the settings snapshot has
// not been hydrated yet (pre-install, or the very first request after
// boot if a hydration race ever lets a request slip past the install
// gate). The values are sourced from `rateLimitDefaults` in the
// section registry — the same payload the install flow seeds and the
// `loadSettingsFromDb` backfill writes for upgrading deployments — so
// the fallback path behaves identically to the seeded path.
const FALLBACK_RATE_LIMITS: RateLimitSettings = rateLimitDefaults

export function readBucket(name: keyof RateLimitSettings): RateLimitBucket {
  // We deliberately read the snapshot synchronously every call — the
  // in-process slot is a single-pointer load, so the cost is
  // negligible and an admin save takes effect on the very next
  // request without any TTL or restart.
  const bundle = getBlogSettingsBundleSync()
  const live = bundle?.rateLimit?.[name]
  if (live !== undefined) {
    return live
  }
  return FALLBACK_RATE_LIMITS[name]
}

export interface RateLimitResult {
  /** Post-increment counter value within the current window. */
  count: number
  /** True once the counter strictly exceeds the configured `maxAttempts`. */
  exceeded: boolean
}

interface WindowEntry {
  count: number
  /** Epoch ms at which the current window closes and the counter resets. */
  resetAt: number
}

const entries = new Map<string, WindowEntry>()

// Hard cap on tracked keys. Expired entries are removed lazily — when
// the same key is hit again, or by the sweeps below — so an attacker
// spraying unique IPs/emails could otherwise grow the map without
// bound. 10k entries at ~100 bytes each is ~1 MB: negligible.
const MAX_ENTRIES = 10_000

function sweepExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (now >= entry.resetAt) {
      entries.delete(key)
    }
  }
}

// Make room for one more key when the map is full. Expired windows go
// first; if every entry is still live, evict the windows closest to
// expiring (their counters would have reset soonest anyway, so the
// throttle loss is minimal) and warn — a full map of live counters
// means the process is tracking an unusual number of distinct subjects.
function ensureCapacity(now: number): void {
  if (entries.size < MAX_ENTRIES) {
    return
  }
  sweepExpired(now)
  if (entries.size < MAX_ENTRIES) {
    return
  }
  const excess = entries.size - MAX_ENTRIES + 1
  const byResetAt = [...entries.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
  for (const [key] of byResetAt.slice(0, excess)) {
    entries.delete(key)
  }
  log.warn('rate-limit counter map full; evicted the oldest windows', { evicted: excess, size: entries.size })
}

// Increment-and-check against the in-process fixed window. The first
// hit in a window arms `resetAt` (now + windowSeconds); later hits in
// the same window only bump the counter — the exact semantics of the
// old INCR + EXPIRE … NX pipeline, minus the network round trip. The
// signature stays async so every caller is untouched.
export async function tryKeyedRateLimit(key: string, bucket: RateLimitBucket): Promise<RateLimitResult> {
  const now = Date.now()
  const live = entries.get(key)
  if (live !== undefined && now < live.resetAt) {
    live.count += 1
    return { count: live.count, exceeded: live.count > bucket.maxAttempts }
  }
  if (live === undefined) {
    ensureCapacity(now)
  }
  const entry: WindowEntry = { count: 1, resetAt: now + bucket.windowSeconds * 1000 }
  entries.set(key, entry)
  return { count: entry.count, exceeded: entry.count > bucket.maxAttempts }
}

/**
 * Number of live (unexpired) counter windows, for the admin cache
 * panel. Expired entries are swept first so the count never includes
 * ghosts.
 */
export function rateLimitEntryCount(): number {
  sweepExpired(Date.now())
  return entries.size
}

/** Test-only seam: wipe every counter so cases start from a clean map. */
export function __resetRateLimitsForTests(): void {
  entries.clear()
}

/** Test-only seam: list the tracked key strings (key-shape/privacy assertions). */
export function __rateLimitKeysForTests(): string[] {
  return [...entries.keys()]
}

/**
 * Throttles login attempts by client IP. Counts every reach of the
 * sign-in form (success and failure both bump the counter); the
 * threshold is "attempts per `windowSeconds`" and the bookkeeping
 * shouldn't depend on the eventual outcome of the login.
 */
export async function tryRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(signInKey(ip), readBucket('signInIp'))
}

/** Throttles admin author invitations by client IP. */
export async function tryInviteRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(inviteKey(ip), readBucket('inviteIp'))
}

/**
 * Throttles admin author invitations by `(actor adminId, invitee email)`.
 * Additive to {@link tryInviteRateLimit}: even if an admin's per-IP
 * budget is fresh, they cannot re-send invites to the same mailbox
 * faster than this bucket allows. The email is hashed before it
 * becomes a counter key so the raw address is never stored.
 */
export async function tryInviteByEmailRateLimit(adminId: bigint, email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(inviteEmailKey(adminId, email), readBucket('inviteEmail'))
}

/** Throttles password-reset requests by client IP. */
export async function tryPasswordResetRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetKey(ip), readBucket('passwordResetIp'))
}

/**
 * Throttles public lostpassword submissions by normalised target email.
 * Additive to {@link tryPasswordResetRateLimit}: stops an attacker
 * rotating client IPs from spamming reset prompts to a single mailbox.
 * The email is hashed before it becomes a counter key.
 */
export async function tryPasswordResetByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetEmailKey(email), readBucket('passwordResetEmail'))
}

/**
 * Throttles admin-triggered password-reset emails by target user id.
 * Scoped per-target (not per-actor) so any admin — including a
 * compromised cookie — can't carpet-bomb a single mailbox even if
 * their own IP budget is fresh.
 */
export async function tryPasswordResetByTargetRateLimit(userId: bigint): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetTargetKey(userId), readBucket('passwordResetTarget'))
}

/** Throttles public comment submissions by IP (independent of login rate limits). */
export async function tryCommentPostRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(commentPostIpKey(ip), readBucket('commentPostIp'))
}

/** Throttles public comment submissions by normalized email (spam from many IPs, one mailbox). */
export async function tryCommentPostRateLimitByEmail(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(commentPostEmailKey(email), readBucket('commentPostEmail'))
}

/**
 * Throttles `like` increases by client IP. Cancellation (the
 * token-driven decrease path) intentionally does NOT bump this
 * counter — only fresh inserts add `like` rows to the DB, so
 * gating insertion is the right shape to keep table growth
 * bounded. An admin who wants to relax the cap (e.g. a viral post)
 * can raise `maxAttempts` from `/admin/settings/rate-limit`
 * without touching cancel flows.
 */
export async function tryLikeIncreaseRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(likeIncreaseKey(ip), readBucket('likeIncreaseIp'))
}

const resourceKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}resource:${ip}`

export async function tryResourceRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(resourceKey(ip), readBucket('resourceIp'))
}

export async function tryOtpSendRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpSendIpKey(ip), readBucket('otpSendIp'))
}

export async function tryOtpSendByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpSendEmailKey(email), readBucket('otpSendEmail'))
}

export async function tryOtpVerifyRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpVerifyIpKey(ip), readBucket('otpVerifyIp'))
}

export async function tryOtpVerifyByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpVerifyEmailKey(email), readBucket('otpVerifyEmail'))
}

const signInEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}signin-email:${hashEmail(email)}`

export async function trySignInByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(signInEmailKey(email), readBucket('signInEmail'))
}

export async function tryPasskeyAuthBeginRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyAuthBeginIpKey(ip), readBucket('passkeyAuthBeginIp'))
}

export async function tryPasskeyAuthFinishRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyAuthFinishIpKey(ip), readBucket('passkeyAuthFinishIp'))
}

export async function tryPasskeyRegisterBeginRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyRegisterBeginIpKey(ip), readBucket('passkeyRegisterBeginIp'))
}

export async function tryPasskeyRegisterFinishRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyRegisterFinishIpKey(ip), readBucket('passkeyRegisterFinishIp'))
}

export async function tryPasskeySetForceRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeySetForceIpKey(ip), readBucket('passkeySetForceIp'))
}

export async function tryPasskeyDeleteRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyDeleteIpKey(ip), readBucket('passkeyDeleteIp'))
}

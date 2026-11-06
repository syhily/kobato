import { createHash } from 'node:crypto'
import { isIPv6 } from 'node:net'

import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { getLogger } from '@/server/infra/logger'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('rate-limit')

// In-process fixed-window counters (no external store: reset on restart,
// not shared across instances). Keys keep the reserved `rate-limit:`
// namespace — see `RESERVED_CACHE_PREFIXES` in settings/sections/cache.
const RATE_LIMIT_NAMESPACE = 'rate-limit:'

// Hash the email so the raw address never lands in the counter map (SHA-256, 32 hex chars).
function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

/** Counter key for a client IP. IPv6 clients are grouped by their /64
 *  prefix: a single network typically owns the whole /64, so per-address
 *  keys would hand it an unbounded pool of "IPs". IPv4 keys stay verbatim;
 *  IPv4-mapped v6 keys normalize to the embedded v4 address. */
export function rateLimitIpKey(ip: string): string {
  if (!isIPv6(ip)) {
    return ip
  }
  const withoutZone = ip.replace(/%.*$/, '')
  const v4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(withoutZone)
  if (v4Mapped?.[1] !== undefined) {
    return v4Mapped[1]
  }
  // Expand `::` and keep the first four hextets (the /64 network prefix).
  const [head = '', tail] = withoutZone.split('::')
  const headParts = head === '' ? [] : head.split(':')
  const tailParts = tail === undefined || tail === '' ? [] : tail.split(':')
  const missing = Math.max(8 - headParts.length - tailParts.length, 0)
  const parts = [...headParts, ...Array.from({ length: missing }, () => '0'), ...tailParts]
  return `${parts
    .slice(0, 4)
    .map((part) => part || '0')
    .join(':')}::/64`
}

// Fallbacks used only before the settings snapshot is hydrated; sourced from `rateLimitDefaults`, same payload the install flow seeds.
const FALLBACK_RATE_LIMITS: RateLimitSettings = rateLimitDefaults

export function readBucket(name: keyof RateLimitSettings): RateLimitBucket {
  // Sync read per call so an admin save takes effect on the very next request.
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

// Hard cap so a spray of unique keys can't grow the map without bound; removal is lazy.
const MAX_ENTRIES = 10_000

function sweepExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (now >= entry.resetAt) {
      entries.delete(key)
    }
  }
}

// Map full: sweep expired first, then evict the windows closest to expiring and warn.
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

// Fixed-window increment-and-check; stays async so every caller is untouched.
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

/** Number of live (unexpired) counter windows for the admin cache panel. */
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

// Counter dimensions: a scenario's settings bucket feeds one or more counter
// families (per-IP, per-email, …). The families stay distinct — only the
// configured (window, maxAttempts) is shared since the twin-bucket merge.

/** Counter keyed by client IP (IPv6 grouped by /64 — see rateLimitIpKey). */
function byIp(bucket: keyof RateLimitSettings, ns: string) {
  return (ip: string): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${rateLimitIpKey(ip)}`, readBucket(bucket))
}

/** Counter keyed by hashed email (spam from many IPs, one mailbox). */
function byEmail(bucket: keyof RateLimitSettings, ns: string) {
  return (email: string): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${hashEmail(email)}`, readBucket(bucket))
}

/** Counter keyed by target user id — per-target, so no admin (even a
 *  compromised cookie) can carpet-bomb a mailbox. */
function byUserId(bucket: keyof RateLimitSettings, ns: string) {
  return (userId: number): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${userId.toString()}`, readBucket(bucket))
}

/** Counter keyed by `(adminId, invitee email)`; additive to the per-IP one. */
function byAdminEmail(bucket: keyof RateLimitSettings, ns: string) {
  return (adminId: number, email: string): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${adminId.toString()}:${hashEmail(email)}`, readBucket(bucket))
}

/** Login attempts by client IP; success and failure both bump the counter. */
export const tryRateLimit = byIp('signIn', 'signin')

/** Login attempts by target email; additive to the per-IP one. */
export const trySignInByEmailRateLimit = byEmail('signIn', 'signin-email')

export const tryOtpSendRateLimit = byIp('otpSend', 'otp-send')
export const tryOtpSendByEmailRateLimit = byEmail('otpSend', 'otp-send-email')
export const tryOtpVerifyRateLimit = byIp('otpVerify', 'otp-verify')
export const tryOtpVerifyByEmailRateLimit = byEmail('otpVerify', 'otp-verify-email')

/** Public lostpassword form by client IP. */
export const tryPasswordResetRateLimit = byIp('passwordReset', 'password-reset')

/** Public lostpassword form by target email; additive to the per-IP one. */
export const tryPasswordResetByEmailRateLimit = byEmail('passwordReset', 'password-reset-email')

/** Admin-triggered password-reset emails by target user id. */
export const tryPasswordResetByTargetRateLimit = byUserId('passwordResetTarget', 'password-reset-target')

/** Public comment submissions by IP (independent of login rate limits). */
export const tryCommentPostRateLimit = byIp('comment', 'comment-post')

/** Public comment submissions by author email. */
export const tryCommentPostRateLimitByEmail = byEmail('comment', 'comment-email')

// Newsletter subscribe is anonymous AND mails the submitted address, so the
// per-IP resource bucket alone makes it an email-bomb relay for one victim.
// No settings bucket (the surface stays deliberately small after the
// twin-bucket merge): 3/hour per address is ample for a human confirming.
const NEWSLETTER_SUBSCRIBE_EMAIL_BUCKET: RateLimitBucket = { windowSeconds: 60 * 60, maxAttempts: 3 }

/** Newsletter subscribe attempts by target address. */
export const tryNewsletterSubscribeByEmailRateLimit = (email: string): Promise<RateLimitResult> =>
  tryKeyedRateLimit(
    `${RATE_LIMIT_NAMESPACE}newsletter-subscribe-email:${hashEmail(email)}`,
    NEWSLETTER_SUBSCRIBE_EMAIL_BUCKET,
  )

/** `like` increases by client IP; cancellation does NOT bump this counter —
 *  only fresh inserts add rows, keeping table growth bounded. */
export const tryLikeIncreaseRateLimit = byIp('like', 'like-increase')

/** Admin invitations by client IP. */
export const tryInviteRateLimit = byIp('invite', 'invite')

/** Admin invitations by `(adminId, invitee email)`; additive to the per-IP one. */
export const tryInviteByEmailRateLimit = byAdminEmail('invite', 'invite-email')

/** Public resources (RSS, sitemap, OG images, avatars) by client IP. */
export const tryResourceRateLimit = byIp('resource', 'resource')

export const tryPasskeyAuthBeginRateLimit = byIp('passkeyAuth', 'passkey-auth-begin')
export const tryPasskeyAuthFinishRateLimit = byIp('passkeyAuth', 'passkey-auth-finish')
export const tryPasskeyRegisterBeginRateLimit = byIp('passkeyManage', 'passkey-register-begin')
export const tryPasskeyRegisterFinishRateLimit = byIp('passkeyManage', 'passkey-register-finish')
export const tryPasskeySetForceRateLimit = byIp('passkeyManage', 'passkey-set-force')
export const tryPasskeyDeleteRateLimit = byIp('passkeyManage', 'passkey-delete')

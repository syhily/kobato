import { createHash } from 'node:crypto'

import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { getLogger } from '@/server/infra/logger'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('rate-limit')

// In-process fixed-window counters (no external store: reset on restart,
// not shared across instances). Keys keep the reserved `rate-limit:`
// namespace — see `RESERVED_CACHE_PREFIXES` in settings/sections/cache.
const RATE_LIMIT_NAMESPACE = 'rate-limit:'

const signInKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}signin:${ip}`
const inviteKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}invite:${ip}`
const passwordResetKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}password-reset:${ip}`
const passwordResetTargetKey = (userId: number) => `${RATE_LIMIT_NAMESPACE}password-reset-target:${userId.toString()}`
const commentPostIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}comment-post:${ip}`

// Hash the email so the raw address never lands in the counter map (SHA-256, 32 hex chars).
function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

const commentPostEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}comment-email:${hashEmail(email)}`
const inviteEmailKey = (adminId: number, email: string) =>
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

/**
 * Throttles login attempts by client IP; success and failure both bump the counter.
 */
export async function tryRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(signInKey(ip), readBucket('signInIp'))
}

export async function tryInviteRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(inviteKey(ip), readBucket('inviteIp'))
}

/**
 * Throttles invitations by `(adminId, invitee email)`; additive to
 * {@link tryInviteRateLimit}. Email is hashed before it becomes a key.
 */
export async function tryInviteByEmailRateLimit(adminId: number, email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(inviteEmailKey(adminId, email), readBucket('inviteEmail'))
}

export async function tryPasswordResetRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetKey(ip), readBucket('passwordResetIp'))
}

/**
 * Throttles lostpassword submissions by target email; additive to
 * {@link tryPasswordResetRateLimit}. Email is hashed before it becomes a key.
 */
export async function tryPasswordResetByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetEmailKey(email), readBucket('passwordResetEmail'))
}

/**
 * Throttles admin-triggered password-reset emails by target user id —
 * per-target, so no admin (even a compromised cookie) can carpet-bomb a mailbox.
 */
export async function tryPasswordResetByTargetRateLimit(userId: number): Promise<RateLimitResult> {
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
 * Throttles `like` increases by client IP; cancellation does NOT bump this
 * counter — only fresh inserts add rows, keeping table growth bounded.
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

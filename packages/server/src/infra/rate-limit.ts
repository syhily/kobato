import type { RateLimitBucket, RateLimitSettings } from '@kobato/settings/types.ts'

import { getLogger } from '@kobato/server/infra/logger.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults.ts'
import { createHash } from 'node:crypto'
import { isIPv6 } from 'node:net'

const log = getLogger('rate-limit')

const RATE_LIMIT_NAMESPACE = 'rate-limit:'

function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

export function rateLimitIpKey(ip: string): string {
  if (!isIPv6(ip)) {
    return ip
  }
  const withoutZone = ip.replace(/%.*$/, '')
  const v4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(withoutZone)
  if (v4Mapped?.[1] !== undefined) {
    return v4Mapped[1]
  }
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

const FALLBACK_RATE_LIMITS: RateLimitSettings = rateLimitDefaults

export function readBucket(name: keyof RateLimitSettings): RateLimitBucket {
  const bundle = getBlogSettingsBundleSync()
  const live = bundle?.rateLimit?.[name]
  if (live !== undefined) {
    return live
  }
  return FALLBACK_RATE_LIMITS[name]
}

export interface RateLimitResult {
  count: number
  exceeded: boolean
}

interface WindowEntry {
  count: number
  resetAt: number
}

const entries = new Map<string, WindowEntry>()

const MAX_ENTRIES = 10_000

function sweepExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (now >= entry.resetAt) {
      entries.delete(key)
    }
  }
}

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

export function rateLimitEntryCount(): number {
  sweepExpired(Date.now())
  return entries.size
}

export function __resetRateLimitsForTests(): void {
  entries.clear()
}

export function __rateLimitKeysForTests(): string[] {
  return [...entries.keys()]
}

function byIp(bucket: keyof RateLimitSettings, ns: string) {
  return (ip: string): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${rateLimitIpKey(ip)}`, readBucket(bucket))
}

function byEmail(bucket: keyof RateLimitSettings, ns: string) {
  return (email: string): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${hashEmail(email)}`, readBucket(bucket))
}

function byUserId(bucket: keyof RateLimitSettings, ns: string) {
  return (userId: number): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${userId.toString()}`, readBucket(bucket))
}

function byAdminEmail(bucket: keyof RateLimitSettings, ns: string) {
  return (adminId: number, email: string): Promise<RateLimitResult> =>
    tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}${ns}:${adminId.toString()}:${hashEmail(email)}`, readBucket(bucket))
}

export const tryRateLimit = byIp('signIn', 'signin')

export const trySignInByEmailRateLimit = byEmail('signIn', 'signin-email')

export const tryOtpSendRateLimit = byIp('otpSend', 'otp-send')
export const tryOtpSendByEmailRateLimit = byEmail('otpSend', 'otp-send-email')
export const tryOtpVerifyRateLimit = byIp('otpVerify', 'otp-verify')
export const tryOtpVerifyByEmailRateLimit = byEmail('otpVerify', 'otp-verify-email')

export const tryPasswordResetRateLimit = byIp('passwordReset', 'password-reset')

export const tryPasswordResetByEmailRateLimit = byEmail('passwordReset', 'password-reset-email')

export const tryPasswordResetByTargetRateLimit = byUserId('passwordResetTarget', 'password-reset-target')

export const tryCommentPostRateLimit = byIp('comment', 'comment-post')

export const tryCommentPostRateLimitByEmail = byEmail('comment', 'comment-email')

const NEWSLETTER_SUBSCRIBE_EMAIL_BUCKET: RateLimitBucket = { windowSeconds: 60 * 60, maxAttempts: 3 }

export const tryNewsletterSubscribeByEmailRateLimit = (email: string): Promise<RateLimitResult> =>
  tryKeyedRateLimit(
    `${RATE_LIMIT_NAMESPACE}newsletter-subscribe-email:${hashEmail(email)}`,
    NEWSLETTER_SUBSCRIBE_EMAIL_BUCKET,
  )

const NOTIFICATION_REPLY_BUCKET: RateLimitBucket = { windowSeconds: 60, maxAttempts: 10 }

export const tryNotificationReplyRateLimit = (userId: number | string): Promise<RateLimitResult> =>
  tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}notification-reply:${userId}`, NOTIFICATION_REPLY_BUCKET)

const BACKUP_RESTORE_PASSWORD_BUCKET: RateLimitBucket = { windowSeconds: 60 * 60, maxAttempts: 10 }

export const tryBackupRestorePasswordRateLimit = (adminId: string, backupKey: string): Promise<RateLimitResult> =>
  tryKeyedRateLimit(
    `${RATE_LIMIT_NAMESPACE}backup-restore-password:${adminId}:${backupKey}`,
    BACKUP_RESTORE_PASSWORD_BUCKET,
  )

export const tryLikeIncreaseRateLimit = byIp('like', 'like-increase')

export const tryInviteRateLimit = byIp('invite', 'invite')

export const tryInviteByEmailRateLimit = byAdminEmail('invite', 'invite-email')

export const tryResourceRateLimit = byIp('resource', 'resource')

const DEVICE_ENV_BEACON_BUCKET: RateLimitBucket = { windowSeconds: 60, maxAttempts: 120 }

export const tryDeviceEnvBeaconRateLimit = (ip: string): Promise<RateLimitResult> =>
  tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}analytics-env-beacon:${rateLimitIpKey(ip)}`, DEVICE_ENV_BEACON_BUCKET)

const RUM_INTAKE_BUCKET: RateLimitBucket = { windowSeconds: 60, maxAttempts: 240 }

export const tryRumIntakeRateLimit = (ip: string): Promise<RateLimitResult> =>
  tryKeyedRateLimit(`${RATE_LIMIT_NAMESPACE}rum-intake:${rateLimitIpKey(ip)}`, RUM_INTAKE_BUCKET)

export const tryPasskeyAuthBeginRateLimit = byIp('passkeyAuth', 'passkey-auth-begin')
export const tryPasskeyAuthFinishRateLimit = byIp('passkeyAuth', 'passkey-auth-finish')
export const tryPasskeyRegisterBeginRateLimit = byIp('passkeyManage', 'passkey-register-begin')
export const tryPasskeyRegisterFinishRateLimit = byIp('passkeyManage', 'passkey-register-finish')
export const tryPasskeySetForceRateLimit = byIp('passkeyManage', 'passkey-set-force')
export const tryPasskeyDeleteRateLimit = byIp('passkeyManage', 'passkey-delete')

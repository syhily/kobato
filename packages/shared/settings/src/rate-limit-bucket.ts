import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { rateLimitBounds } from '@kobato/settings/rate-limit-defaults.ts'
import { z } from 'zod'

export const rateLimitBucketMessages = {
  windowInteger: 'admin.settings.rateLimit.error.windowInteger',
  windowMin: 'admin.settings.rateLimit.error.windowMin',
  windowMax: 'admin.settings.rateLimit.error.windowMax',
  attemptsInteger: 'admin.settings.rateLimit.error.attemptsInteger',
  attemptsMin: 'admin.settings.rateLimit.error.attemptsMin',
  attemptsMax: 'admin.settings.rateLimit.error.attemptsMax',
} as const satisfies Record<string, UiMessageId>

export const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce
    .number()
    .int(rateLimitBucketMessages.windowInteger)
    .min(rateLimitBounds.windowSeconds.min, rateLimitBucketMessages.windowMin)
    .max(rateLimitBounds.windowSeconds.max, rateLimitBucketMessages.windowMax),
  maxAttempts: z.coerce
    .number()
    .int(rateLimitBucketMessages.attemptsInteger)
    .min(rateLimitBounds.maxAttempts.min, rateLimitBucketMessages.attemptsMin)
    .max(rateLimitBounds.maxAttempts.max, rateLimitBucketMessages.attemptsMax),
})

const LEGACY_BUCKET_TWINS: Record<string, readonly string[]> = {
  signIn: ['signInIp', 'signInEmail'],
  otpSend: ['otpSendIp', 'otpSendEmail'],
  otpVerify: ['otpVerifyIp', 'otpVerifyEmail'],
  passwordReset: ['passwordResetIp', 'passwordResetEmail'],
  comment: ['commentPostIp', 'commentPostEmail'],
  like: ['likeIncreaseIp'],
  invite: ['inviteIp', 'inviteEmail'],
  resource: ['resourceIp'],
  passkeyAuth: ['passkeyAuthBeginIp', 'passkeyAuthFinishIp'],
  passkeyManage: ['passkeyRegisterBeginIp', 'passkeyRegisterFinishIp', 'passkeySetForceIp', 'passkeyDeleteIp'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLegacyBucket(value: unknown): value is { windowSeconds: number; maxAttempts: number } {
  return isRecord(value) && typeof value.windowSeconds === 'number' && typeof value.maxAttempts === 'number'
}

function stricterBucket(
  a: { windowSeconds: number; maxAttempts: number },
  b: { windowSeconds: number; maxAttempts: number },
): { windowSeconds: number; maxAttempts: number } {
  if (a.maxAttempts !== b.maxAttempts) {
    return a.maxAttempts < b.maxAttempts ? a : b
  }
  return a.windowSeconds >= b.windowSeconds ? a : b
}

export function upgradeLegacyRateLimitBuckets(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw
  }
  const upgraded: Record<string, unknown> = { ...raw }
  for (const [mergedKey, legacyKeys] of Object.entries(LEGACY_BUCKET_TWINS)) {
    if (upgraded[mergedKey] !== undefined) {
      continue
    }
    const present = legacyKeys.map((key) => upgraded[key]).filter(isLegacyBucket)
    if (present.length > 0) {
      upgraded[mergedKey] = present.reduce(stricterBucket)
    }
  }
  return upgraded
}

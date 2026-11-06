import { z } from 'zod'

import { rateLimitBounds } from '@/shared/config/defaults'

// One rate-limit bucket's validation schema — the single source shared by the
// server section schema (`server/domains/settings/sections/rate-limit`) and the
// admin form's client-side mirror (`ui/admin/settings/ThresholdForm`), so an
// out-of-range value is rejected with the SAME message on both sides. The
// messages are user-facing: a server-rejected save surfaces them in the toast
// through the ORPCError issues channel.
export const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce
    .number()
    .int('时间窗口必须是整数秒')
    .min(rateLimitBounds.windowSeconds.min, `时间窗口不能小于 ${rateLimitBounds.windowSeconds.min} 秒`)
    .max(rateLimitBounds.windowSeconds.max, `时间窗口不能超过 ${rateLimitBounds.windowSeconds.max} 秒（24 小时）`),
  maxAttempts: z.coerce
    .number()
    .int('最大尝试次数必须是整数')
    .min(rateLimitBounds.maxAttempts.min, `最大尝试次数不能小于 ${rateLimitBounds.maxAttempts.min}`)
    .max(rateLimitBounds.maxAttempts.max, `最大尝试次数不能超过 ${rateLimitBounds.maxAttempts.max}`),
})

// Legacy per-dimension twins → merged scenario bucket. Rows stored before
// the merge still carry the old keys; the section schema preprocesses them
// through this upgrade so they parse into the current shape and persist as
// the new shape on the next save.
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

// The stricter twin survives: fewer attempts wins; ties go to the longer window.
function stricterBucket(
  a: { windowSeconds: number; maxAttempts: number },
  b: { windowSeconds: number; maxAttempts: number },
): { windowSeconds: number; maxAttempts: number } {
  if (a.maxAttempts !== b.maxAttempts) {
    return a.maxAttempts < b.maxAttempts ? a : b
  }
  return a.windowSeconds >= b.windowSeconds ? a : b
}

/** Map legacy per-dimension keys onto the merged scenario keys (new keys
 *  win when both are present; legacy keys are left for the object schema to
 *  strip). Identity on already-current rows. */
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

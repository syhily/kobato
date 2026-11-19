import type { RateLimitSettings } from '@kobato/settings/types.ts'
import type { Assert, Equals } from '@kobato/utils/type-equals.ts'

export const rateLimitBounds = {
  windowSeconds: { min: 60, max: 60 * 60 * 24 },
  maxAttempts: { min: 1, max: 1000 },
} as const

export const rateLimitDefaults = {
  signIn: { windowSeconds: 60 * 30, maxAttempts: 5 },
  otpSend: { windowSeconds: 60 * 5, maxAttempts: 3 },
  otpVerify: { windowSeconds: 60 * 5, maxAttempts: 5 },
  passwordReset: { windowSeconds: 60 * 30, maxAttempts: 3 },
  passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
  comment: { windowSeconds: 60 * 60, maxAttempts: 12 },
  like: { windowSeconds: 60 * 60, maxAttempts: 30 },
  invite: { windowSeconds: 60 * 60, maxAttempts: 3 },
  resource: { windowSeconds: 60, maxAttempts: 60 },
  passkeyAuth: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeyManage: { windowSeconds: 60 * 5, maxAttempts: 10 },
} as const

type _rateLimitDefaultsKeyParity = Assert<Equals<keyof typeof rateLimitDefaults, keyof RateLimitSettings>>

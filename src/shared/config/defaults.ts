// Conservative rate-limit defaults used by the install seed, the
// settings backfill, and the infra rate-limit fallback path.
export const rateLimitDefaults = {
  signInIp: { windowSeconds: 60 * 30, maxAttempts: 5 },
  commentPostIp: { windowSeconds: 60 * 60, maxAttempts: 12 },
  commentPostEmail: { windowSeconds: 60 * 60, maxAttempts: 8 },
  likeIncreaseIp: { windowSeconds: 60 * 60, maxAttempts: 30 },
  inviteIp: { windowSeconds: 60 * 60, maxAttempts: 5 },
  inviteEmail: { windowSeconds: 60 * 60, maxAttempts: 1 },
  passwordResetIp: { windowSeconds: 60 * 30, maxAttempts: 3 },
  passwordResetEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
  passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
  resourceIp: { windowSeconds: 60, maxAttempts: 60 },
  otpSendIp: { windowSeconds: 60 * 5, maxAttempts: 3 },
  otpSendEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
  otpVerifyIp: { windowSeconds: 60 * 5, maxAttempts: 5 },
  otpVerifyEmail: { windowSeconds: 60 * 5, maxAttempts: 5 },
} as const

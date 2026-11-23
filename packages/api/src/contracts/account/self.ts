import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { clearable } from '@kobato/api/contracts/primitives'
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordWithinBcryptLimit,
  PASSWORD_COMPLEXITY_RE,
} from '@kobato/auth/security'
import { optionalHttpUrlSchema } from '@kobato/utils/url-schema'
import { z } from 'zod'

export const LOGIN_METHODS = ['password', 'magic-link', 'passkey'] as const
export const loginMethodSchema = z.enum(LOGIN_METHODS)
export type LoginMethod = z.infer<typeof loginMethodSchema>

export const passwordValidationMessages = {
  passwordTooShort: 'auth.validation.passwordTooShort',
  passwordTooLong: 'auth.validation.passwordTooLong',
  passwordComplexity: 'auth.validation.passwordComplexity',
} as const satisfies Record<string, UiMessageId>

export function newPasswordSchema() {
  return z
    .string()
    .min(MIN_PASSWORD_LENGTH, passwordValidationMessages.passwordTooShort)
    .superRefine((value, ctx) => {
      if (!passwordWithinBcryptLimit(value)) {
        ctx.addIssue({
          code: 'custom',
          message: passwordValidationMessages.passwordTooLong,
          params: { max: MAX_PASSWORD_BYTES },
        })
      }
      if (!PASSWORD_COMPLEXITY_RE.test(value)) {
        ctx.addIssue({ code: 'custom', message: passwordValidationMessages.passwordComplexity })
      }
    })
}

export interface AccountProfile {
  id: string
  name: string
  email: string
  link: string
  role: 'admin' | 'author' | 'visitor' | null
  badgeName: string
  badgeColor: string
  createdAt: string | null
  lastIp: string | null
  lastUa: string | null
  loginMethod: LoginMethod
}

export const accountProfileOutputSchema = z.object({
  user: z.custom<AccountProfile>(),
  passkeyEnabled: z.boolean(),
  mailReady: z.boolean(),
})
export type AccountProfileOutput = z.infer<typeof accountProfileOutputSchema>

export const accountUpdateProfileInput = z.object({
  name: z.string().min(1).max(50).optional(),
  link: clearable(optionalHttpUrlSchema),
  badgeName: clearable(z.string().max(20)),
  badgeColor: clearable(z.string().max(7)),
  badgeTextColor: clearable(z.string().max(7)),
  receiveEmail: z.boolean().optional(),
})
export type AccountUpdateProfileInput = z.infer<typeof accountUpdateProfileInput>

export interface AccountSessionDto {
  sid: string
  userId: number
  label: string
  ip: string
  loginAt: Date
  lastActiveAt: Date
  expiresAt: Date
}

export const accountSessionsOutputSchema = z.custom<AccountSessionDto[]>()
export type AccountSessionsOutput = z.infer<typeof accountSessionsOutputSchema>

export const accountUserDto = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  link: z.string().nullable(),
  badgeName: z.string().nullable(),
  badgeColor: z.string().nullable(),
  badgeTextColor: z.string().nullable(),
  role: z.enum(['admin', 'author', 'visitor']).nullable(),
  emailVerified: z.boolean(),
})
export type AccountUserDto = z.infer<typeof accountUserDto>

export const accountUpdateProfileOutputSchema = z.object({ user: accountUserDto })
export type AccountUpdateProfileOutput = z.infer<typeof accountUpdateProfileOutputSchema>

export const accountUpdatePasswordInput = z.object({
  oldPassword: z.string().min(1),
  newPassword: newPasswordSchema(),
})
export type AccountUpdatePasswordInput = z.infer<typeof accountUpdatePasswordInput>

export const accountRevokeSessionInput = z.object({ id: z.string().min(1) })

export const accountRevokeSessionOutputSchema = z.object({
  success: z.boolean(),
  currentSession: z.boolean(),
})
export type AccountRevokeSessionOutput = z.infer<typeof accountRevokeSessionOutputSchema>

export const accountSetLoginMethodInput = z.object({ method: loginMethodSchema })
export type AccountSetLoginMethodInput = z.infer<typeof accountSetLoginMethodInput>

export interface MySessionItem {
  sid: string
  label: string
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'
import { MIN_PASSWORD_LENGTH } from '@/shared/utils/security'

/** Maximum password length to prevent DoS via oversized payloads. */
export const MAX_PASSWORD_LENGTH = 128

/**
 * bcrypt silently truncates at 72 BYTES — a longer "password" is really
 * just its 72-byte prefix, so two distinct secrets could compare equal.
 * Creation paths therefore cap by byte length (multi-byte runes count
 * fully). Signin keeps the plain 128-char DoS cap instead: bcrypt
 * truncates both sides of a compare identically, so legacy long passwords
 * keep working there.
 */
export const MAX_PASSWORD_BYTES = 72

/**
 * Custom validation-rule messages are typed UI-catalog ids (never prose): the
 * server maps them into wire descriptors at the boundary (`zodIssuesToWire`,
 * or `authFlowValidationError` for the route-form flows), and numeric bounds
 * like `{min}`/`{max}` ride the issue's derived params.
 */
export const authValidationMessages = {
  siteNameRequired: 'auth.validation.siteNameRequired',
  nameRequired: 'auth.validation.nameRequired',
  emailInvalid: 'auth.validation.emailInvalid',
  passwordTooShort: 'auth.validation.passwordTooShort',
  passwordTooLong: 'auth.validation.passwordTooLong',
  passwordComplexity: 'auth.validation.passwordComplexity',
  updateFieldRequired: 'auth.validation.updateFieldRequired',
} as const satisfies Record<string, UiMessageId>

export function passwordWithinBcryptLimit(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES
}

/** Password complexity regex, applied on top of the minimum length. */
export const PASSWORD_COMPLEXITY_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

/**
 * The one new-password rule set (bcrypt byte ceiling + complexity), shared by
 * the setup form, the reset flow and the account password change.
 */
export function newPasswordSchema() {
  return z
    .string()
    .min(MIN_PASSWORD_LENGTH, authValidationMessages.passwordTooShort)
    .superRefine((value, ctx) => {
      if (!passwordWithinBcryptLimit(value)) {
        ctx.addIssue({
          code: 'custom',
          message: authValidationMessages.passwordTooLong,
          params: { max: MAX_PASSWORD_BYTES },
        })
      }
      if (!PASSWORD_COMPLEXITY_RE.test(value)) {
        ctx.addIssue({ code: 'custom', message: authValidationMessages.passwordComplexity })
      }
    })
}

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})
export type SignInInput = z.infer<typeof signInSchema>

export const signUpAdminSchema = z.object({
  title: z.string({ message: authValidationMessages.siteNameRequired }).min(1, authValidationMessages.siteNameRequired),
  name: z.string({ message: authValidationMessages.nameRequired }).min(1, authValidationMessages.nameRequired),
  email: z.email({ message: authValidationMessages.emailInvalid }),
  password: newPasswordSchema(),
  locale: z.enum(SUPPORTED_LOCALES).default(DEFAULT_LOCALE),
})
export type SignUpAdminInput = z.infer<typeof signUpAdminSchema>

export const updateUserSchema = z
  .object({
    userId: z.string(),
    name: z.string().min(1).optional(),
    email: z.email().optional(),
    link: httpUrlOrEmptyStringSchema.optional(),
    badgeName: z.string().optional(),
    badgeColor: z.string().optional(),
    // Manual override: string (picker output), `null` ("clear"), or
    // `undefined` ("don't touch"); empty strings normalise to `null`.
    badgeTextColor: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => (value === undefined ? undefined : value && value.trim() !== '' ? value : null)),
  })
  .refine(({ userId: _userId, ...patch }) => Object.values(patch).some((value) => value !== undefined), {
    message: authValidationMessages.updateFieldRequired,
  })
export type UpdateUserInput = z.infer<typeof updateUserSchema>

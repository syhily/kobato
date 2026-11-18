import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { MAX_PASSWORD_LENGTH } from '@kobato/auth/security.ts'
import { newPasswordSchema } from '@kobato/contracts/users.ts'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { httpUrlOrEmptyStringSchema } from '@kobato/utils/url-schema.ts'
import { z } from 'zod'

/**
 * Custom validation-rule messages are typed UI-catalog ids, never prose: the server maps
 * them into wire descriptors at the boundary (`zodIssuesToWire`, `authFlowValidationError`).
 * The password-rule ids live with the shared `newPasswordSchema` factory in
 * `@kobato/contracts/users.ts` (`passwordValidationMessages`).
 */
export const authValidationMessages = {
  siteNameRequired: 'auth.validation.siteNameRequired',
  nameRequired: 'auth.validation.nameRequired',
  emailInvalid: 'auth.validation.emailInvalid',
  updateFieldRequired: 'auth.validation.updateFieldRequired',
} as const satisfies Record<string, UiMessageId>

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
    // Manual override: string (picker output), `null` = clear, `undefined` = don't touch.
    badgeTextColor: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => (value === undefined ? undefined : value && value.trim() !== '' ? value : null)),
  })
  .refine(({ userId: _userId, ...patch }) => Object.values(patch).some((value) => value !== undefined), {
    message: authValidationMessages.updateFieldRequired,
  })
export type UpdateUserInput = z.infer<typeof updateUserSchema>

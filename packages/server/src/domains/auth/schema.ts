import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { newPasswordSchema } from '@kobato/api/contracts/users'
import { MAX_PASSWORD_LENGTH } from '@kobato/auth/security'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import { httpUrlOrEmptyStringSchema } from '@kobato/utils/url-schema'
import { z } from 'zod'

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
    badgeTextColor: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => (value === undefined ? undefined : value && value.trim() !== '' ? value : null)),
  })
  .refine(({ userId: _userId, ...patch }) => Object.values(patch).some((value) => value !== undefined), {
    message: authValidationMessages.updateFieldRequired,
  })
export type UpdateUserInput = z.infer<typeof updateUserSchema>

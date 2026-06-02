import { z } from 'zod'

import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'

/** Minimum password length enforced everywhere (login, signup, reset, change). */
export const MIN_PASSWORD_LENGTH = 10

// Auth form schemas.
export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
})
export type SignInInput = z.infer<typeof signInSchema>

export const signUpAdminSchema = z.object({
  title: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
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
    // Optional manual override for the badge text colour. The form
    // sends a string (the picker output), an explicit `null` ("clear
    // override"), or `undefined` ("don't touch"). We normalise empty
    // strings to `null` here so the storage column has just two
    // meaningful states: explicit hex, or NULL → auto-derive.
    badgeTextColor: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => (value === undefined ? undefined : value && value.trim() !== '' ? value : null)),
  })
  .refine(({ userId: _userId, ...patch }) => Object.values(patch).some((value) => value !== undefined), {
    message: '至少需要提供一个更新字段',
  })
export type UpdateUserInput = z.infer<typeof updateUserSchema>

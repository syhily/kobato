import { z } from 'zod'

import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'
import { MIN_PASSWORD_LENGTH } from '@/shared/utils/security'

/** Maximum password length to prevent DoS via oversized payloads. */
export const MAX_PASSWORD_LENGTH = 128

/** Password complexity regex, applied on top of the minimum length. */
export const PASSWORD_COMPLEXITY_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

function passwordSchema() {
  return z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH, `密码长度不能超过 ${MAX_PASSWORD_LENGTH} 位`)
    .regex(PASSWORD_COMPLEXITY_RE, '密码必须包含至少一个大写字母、一个小写字母和一个数字')
}

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})
export type SignInInput = z.infer<typeof signInSchema>

export const signUpAdminSchema = z.object({
  title: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  password: passwordSchema(),
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
    message: '至少需要提供一个更新字段',
  })
export type UpdateUserInput = z.infer<typeof updateUserSchema>

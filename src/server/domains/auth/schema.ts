import { z } from 'zod'

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

export const PASSWORD_BYTE_LIMIT_MESSAGE = `密码过长（最多 ${MAX_PASSWORD_BYTES} 字节）`

export function passwordWithinBcryptLimit(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES
}

/** Password complexity regex, applied on top of the minimum length. */
export const PASSWORD_COMPLEXITY_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

function passwordSchema() {
  return z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .refine(passwordWithinBcryptLimit, PASSWORD_BYTE_LIMIT_MESSAGE)
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

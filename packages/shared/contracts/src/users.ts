import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordWithinBcryptLimit,
  PASSWORD_COMPLEXITY_RE,
} from '@kobato/auth/security.ts'
import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

// Per-user signin method: `password` default, `magic-link` (needs a ready
// mail transport), `passkey` (needs a registered passkey + global switch).
export const LOGIN_METHODS = ['password', 'magic-link', 'passkey'] as const
export const loginMethodSchema = z.enum(LOGIN_METHODS)
export type LoginMethod = z.infer<typeof loginMethodSchema>

/**
 * The one new-password rule set (bcrypt byte ceiling + complexity), shared by
 * setup, reset and account change. Custom messages are typed UI-catalog ids,
 * never prose: the server maps them into wire descriptors at the boundary.
 */
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

export const adminUserDto = z.object({
  id: idString,
  name: z.string(),
  email: z.string(),
  link: z.string().nullable(),
  badgeName: z.string().nullable(),
  badgeColor: z.string().nullable(),
  badgeTextColor: z.string().nullable(),
  role: z.enum(['admin', 'author', 'visitor']).nullable(),
  isMuted: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  commentCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  lastCommentAt: isoDateTime.nullable(),
  passkeyCount: z.number().int().nonnegative(),
  loginMethod: loginMethodSchema,
})
export type AdminUserDto = z.infer<typeof adminUserDto>

// Self-service profile projection; a missing row degrades to empty fields.
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

// Admin users wire — the single Zod source the `@kobato/api` users contract
// composes and the server validates against.

export const adminUserIdInput = z.object({ id: z.string().min(1) })
export type AdminUserIdInput = z.infer<typeof adminUserIdInput>

export const adminUsersListInput = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  role: z.enum(['all', 'admin', 'author', 'visitor', 'normal']).default('all'),
  includeDeleted: z.boolean().default(false),
  hasPosts: z.boolean().default(false),
  hasPages: z.boolean().default(false),
  sortBy: z.enum(['recent', 'commentCount']).default('recent'),
})
export type AdminUsersListInput = z.infer<typeof adminUsersListInput>

export const adminUsersListOutputDto = z.object({
  users: z.array(adminUserDto),
  total: z.number(),
  hasMore: z.boolean(),
})
export type AdminUsersListOutput = z.infer<typeof adminUsersListOutputDto>

export const adminUserMuteInput = z.object({ id: z.string().min(1), muted: z.boolean() })
export type AdminUserMuteInput = z.infer<typeof adminUserMuteInput>

// `{ user: <dto> }` — shared by `get`, `mute` and `clearPasskeys`.
export const adminUserEnvelopeDto = z.object({ user: adminUserDto })
export type AdminUserEnvelopeOutput = z.infer<typeof adminUserEnvelopeDto>

export const adminUserUpdateRoleInput = z.object({
  id: z.string().min(1),
  role: z.enum(['admin', 'author', 'visitor']).nullable(),
})
export type AdminUserUpdateRoleInput = z.infer<typeof adminUserUpdateRoleInput>

export const adminUserUpdateRoleOutputDto = z.object({ user: adminUserDto.nullable() })
export type AdminUserUpdateRoleOutput = z.infer<typeof adminUserUpdateRoleOutputDto>

export const adminUserInviteAuthorInput = z.object({ email: z.email().min(1), name: z.string().min(1).max(100) })
export type AdminUserInviteAuthorInput = z.infer<typeof adminUserInviteAuthorInput>

export const adminUserSendPasswordResetInput = z.object({ email: z.email().min(1) })
export type AdminUserSendPasswordResetInput = z.infer<typeof adminUserSendPasswordResetInput>

export const adminUserClearPasskeysInput = z.object({ id: z.string().min(1) })
export type AdminUserClearPasskeysInput = z.infer<typeof adminUserClearPasskeysInput>

// Sessions / per-user moderation actions (`admin.users.*`).

export const adminUserIdParamInput = z.object({ userId: z.string().min(1) })
export type AdminUserIdParamInput = z.infer<typeof adminUserIdParamInput>

export const adminRevokeSessionInput = z.object({ sessionId: z.string().min(1) })
export type AdminRevokeSessionInput = z.infer<typeof adminRevokeSessionInput>

export const adminRevokeSessionOutputDto = z.object({ success: z.boolean(), currentSession: z.boolean() })
export type AdminRevokeSessionOutput = z.infer<typeof adminRevokeSessionOutputDto>

export const adminBulkApproveCommentsOutputDto = z.object({ approved: z.number() })
export type AdminBulkApproveCommentsOutput = z.infer<typeof adminBulkApproveCommentsOutputDto>

export const adminBulkDeleteCommentsOutputDto = z.object({ deleted: z.number() })
export type AdminBulkDeleteCommentsOutput = z.infer<typeof adminBulkDeleteCommentsOutputDto>

// Public passkey auth-begin (`passkey.authBegin`) — CSRF-less: it only returns
// a single-use 5-minute challenge, nothing is read or mutated.
export const passkeyAuthBeginInputSchema = z.object({
  email: z.email().optional(),
})
export type PasskeyAuthBeginInput = z.input<typeof passkeyAuthBeginInputSchema>

// WebAuthn options blobs come from `@simplewebauthn/server` — opaque to the
// wire schema (`z.any()`), validated inside the auth domain.
export const passkeyOptionsOutputSchema = z.object({ options: z.any() })

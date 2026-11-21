import type { Role } from '@kobato/auth/roles'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { clearable, mergePatchInput } from '@kobato/api/contracts/merge-patch'
import { idString, isoDateTime } from '@kobato/api/contracts/primitives'
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

export const passkeyAuthBeginInputSchema = z.object({
  email: z.email().optional(),
})
export type PasskeyAuthBeginInput = z.input<typeof passkeyAuthBeginInputSchema>

export const passkeyOptionsOutputSchema = z.object({ options: z.any() })

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

export interface AdminSessionDto extends AccountSessionDto {
  userName: string
  userEmail: string
  userRole: Role | null
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

export const accountPasskeyListOutputSchema = z.object({
  credentials: z.array(
    z.object({
      id: z.string(),
      deviceName: z.string().nullable(),
      createdAt: z.string(),
      backedUp: z.boolean(),
    }),
  ),
})
export type AccountPasskeyListOutput = z.infer<typeof accountPasskeyListOutputSchema>

export const accountPasskeyRegisterBeginInput = z.object({ deviceName: z.string().max(100).optional() })
export type AccountPasskeyRegisterBeginInput = z.infer<typeof accountPasskeyRegisterBeginInput>

export const accountPasskeyRegisterBeginOutputSchema = passkeyOptionsOutputSchema

export const accountPasskeyRegisterFinishInput = z.object({
  response: z.any(),
  deviceName: z.string().max(100).optional(),
  challenge: z.string().min(1),
})
export type AccountPasskeyRegisterFinishInput = z.infer<typeof accountPasskeyRegisterFinishInput>

export const accountPasskeyDeleteInput = z.object({ credentialId: z.string().min(1) })
export type AccountPasskeyDeleteInput = z.infer<typeof accountPasskeyDeleteInput>

export const accountSetLoginMethodInput = z.object({ method: loginMethodSchema })
export type AccountSetLoginMethodInput = z.infer<typeof accountSetLoginMethodInput>

export const adminUsersCountOutputSchema = z.number().int().nonnegative()

export const adminUsersListSessionsOutputSchema = z.custom<AdminSessionDto[]>()

export const adminUsersPasskeyFlagOutputSchema = z.boolean()

export const adminUserUpdateInput = mergePatchInput({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  link: clearable(optionalHttpUrlSchema),
  badgeName: clearable(z.string()),
  badgeColor: clearable(z.string()),
  badgeTextColor: clearable(z.string()),
})
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateInput>

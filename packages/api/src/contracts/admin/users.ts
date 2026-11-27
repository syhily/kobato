import type { Role } from '@kobato/base/auth/roles'

import { loginMethodSchema, type AccountSessionDto } from '@kobato/api/contracts/account/self'
import { clearable, idString, isoDateTime, mergePatchInput } from '@kobato/api/contracts/primitives'
import { optionalHttpUrlSchema } from '@kobato/base/utils/url-schema'
import { z } from 'zod'

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

export interface AdminSessionDto extends AccountSessionDto {
  userName: string
  userEmail: string
  userRole: Role | null
}

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

export interface AdminSessionItem {
  sid: string
  userId: string
  userName: string
  userEmail: string
  userRole: 'admin' | 'author' | 'visitor' | null
  label: string
  ip: string
  loginAtIso: string
  lastActiveAtIso: string
  expiresAtIso: string
  isCurrent: boolean
}

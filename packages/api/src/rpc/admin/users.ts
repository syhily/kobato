import {
  adminUserUpdateInput,
  adminUsersCountOutputSchema,
  adminUsersListSessionsOutputSchema,
  adminUsersPasskeyFlagOutputSchema,
  adminBulkApproveCommentsOutputDto,
  adminBulkDeleteCommentsOutputDto,
  adminRevokeSessionInput,
  adminRevokeSessionOutputDto,
  adminUserClearPasskeysInput,
  adminUserEnvelopeDto,
  adminUserIdInput,
  adminUserIdParamInput,
  adminUserInviteAuthorInput,
  adminUserMuteInput,
  adminUserSendPasswordResetInput,
  adminUserUpdateRoleInput,
  adminUserUpdateRoleOutputDto,
  adminUsersListInput,
  adminUsersListOutputDto,
} from '@kobato/api/contracts/admin/users'
import { successDto, voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminUsersCrudContract = {
  count: defineProcedure({ method: 'GET', path: '/admin/users/count' }).output(adminUsersCountOutputSchema),
  passkeyFlag: defineProcedure({ method: 'GET', path: '/admin/users/passkey-flag' }).output(
    adminUsersPasskeyFlagOutputSchema,
  ),
  list: defineProcedure({ method: 'GET', path: '/admin/users/list' })
    .input(adminUsersListInput)
    .output(adminUsersListOutputDto),
  get: defineProcedure({ method: 'GET', path: '/admin/users/get' })
    .input(adminUserIdInput)
    .output(adminUserEnvelopeDto),
  update: defineProcedure({ method: 'POST', path: '/admin/users/update' })
    .input(adminUserUpdateInput)
    .output(successDto),
  softDelete: defineProcedure({ method: 'POST', path: '/admin/users/soft-delete' })
    .input(adminUserIdInput)
    .output(voidOutput),
  restore: defineProcedure({ method: 'POST', path: '/admin/users/restore' }).input(adminUserIdInput).output(successDto),
}

export const adminUsersAdminContract = {
  mute: defineProcedure({ method: 'POST', path: '/admin/users/mute' })
    .input(adminUserMuteInput)
    .output(adminUserEnvelopeDto),
  updateRole: defineProcedure({ method: 'POST', path: '/admin/users/update-role' })
    .input(adminUserUpdateRoleInput)
    .output(adminUserUpdateRoleOutputDto),
  inviteAuthor: defineProcedure({ method: 'POST', path: '/admin/users/invite-author' })
    .input(adminUserInviteAuthorInput)
    .output(successDto),
  sendPasswordReset: defineProcedure({ method: 'POST', path: '/admin/users/send-password-reset' })
    .input(adminUserSendPasswordResetInput)
    .output(successDto),
  clearPasskeys: defineProcedure({ method: 'POST', path: '/admin/users/clear-passkeys' })
    .input(adminUserClearPasskeysInput)
    .output(adminUserEnvelopeDto),
}

export const adminUsersSessionsContract = {
  listSessions: defineProcedure({ method: 'GET', path: '/admin/users/list-sessions' }).output(
    adminUsersListSessionsOutputSchema,
  ),
  revokeSession: defineProcedure({ method: 'POST', path: '/admin/users/revoke-session' })
    .input(adminRevokeSessionInput)
    .output(adminRevokeSessionOutputDto),
  revokeAllSessions: defineProcedure({ method: 'POST', path: '/admin/users/revoke-all-sessions' })
    .input(adminUserIdParamInput)
    .output(successDto),
  bulkApproveComments: defineProcedure({ method: 'POST', path: '/admin/users/bulk-approve-comments' })
    .input(adminUserIdParamInput)
    .output(adminBulkApproveCommentsOutputDto),
  bulkDeleteComments: defineProcedure({ method: 'POST', path: '/admin/users/bulk-delete-comments' })
    .input(adminUserIdParamInput)
    .output(adminBulkDeleteCommentsOutputDto),
}

export const adminUsersContract = {
  ...adminUsersCrudContract,
  ...adminUsersAdminContract,
  ...adminUsersSessionsContract,
}

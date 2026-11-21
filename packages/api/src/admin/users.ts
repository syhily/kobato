import { successDto, voidOutput } from '@kobato/contracts/primitives'
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
} from '@kobato/contracts/users'
import { oc } from '@orpc/contract'

export const adminUsersCrudContract = {
  count: oc.route({ method: 'GET', path: '/admin/users/count' }).output(adminUsersCountOutputSchema),
  passkeyFlag: oc.route({ method: 'GET', path: '/admin/users/passkey-flag' }).output(adminUsersPasskeyFlagOutputSchema),
  list: oc
    .route({ method: 'GET', path: '/admin/users/list' })
    .input(adminUsersListInput)
    .output(adminUsersListOutputDto),
  get: oc.route({ method: 'GET', path: '/admin/users/get' }).input(adminUserIdInput).output(adminUserEnvelopeDto),
  update: oc.route({ method: 'POST', path: '/admin/users/update' }).input(adminUserUpdateInput).output(successDto),
  softDelete: oc.route({ method: 'POST', path: '/admin/users/soft-delete' }).input(adminUserIdInput).output(voidOutput),
  restore: oc.route({ method: 'POST', path: '/admin/users/restore' }).input(adminUserIdInput).output(successDto),
}

export const adminUsersAdminContract = {
  mute: oc.route({ method: 'POST', path: '/admin/users/mute' }).input(adminUserMuteInput).output(adminUserEnvelopeDto),
  updateRole: oc
    .route({ method: 'POST', path: '/admin/users/update-role' })
    .input(adminUserUpdateRoleInput)
    .output(adminUserUpdateRoleOutputDto),
  inviteAuthor: oc
    .route({ method: 'POST', path: '/admin/users/invite-author' })
    .input(adminUserInviteAuthorInput)
    .output(successDto),
  sendPasswordReset: oc
    .route({ method: 'POST', path: '/admin/users/send-password-reset' })
    .input(adminUserSendPasswordResetInput)
    .output(successDto),
  clearPasskeys: oc
    .route({ method: 'POST', path: '/admin/users/clear-passkeys' })
    .input(adminUserClearPasskeysInput)
    .output(adminUserEnvelopeDto),
}

export const adminUsersSessionsContract = {
  listSessions: oc
    .route({ method: 'GET', path: '/admin/users/list-sessions' })
    .output(adminUsersListSessionsOutputSchema),
  revokeSession: oc
    .route({ method: 'POST', path: '/admin/users/revoke-session' })
    .input(adminRevokeSessionInput)
    .output(adminRevokeSessionOutputDto),
  revokeAllSessions: oc
    .route({ method: 'POST', path: '/admin/users/revoke-all-sessions' })
    .input(adminUserIdParamInput)
    .output(successDto),
  bulkApproveComments: oc
    .route({ method: 'POST', path: '/admin/users/bulk-approve-comments' })
    .input(adminUserIdParamInput)
    .output(adminBulkApproveCommentsOutputDto),
  bulkDeleteComments: oc
    .route({ method: 'POST', path: '/admin/users/bulk-delete-comments' })
    .input(adminUserIdParamInput)
    .output(adminBulkDeleteCommentsOutputDto),
}

export const adminUsersContract = {
  ...adminUsersCrudContract,
  ...adminUsersAdminContract,
  ...adminUsersSessionsContract,
}

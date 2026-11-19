import { adminUsersCrudContract } from '@kobato/api/admin/users.ts'
import { splitMergePatch } from '@kobato/contracts/merge-patch.ts'
import { restoreUserById, updateUserById } from '@kobato/db/operations/user.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate.ts'
import {
  countUsers,
  fetchAdminUserDto,
  listUsersForAdmin,
  softDeleteUserWithGuard,
  toAdminUserDto,
} from '@kobato/server/domains/users/services/admin.ts'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { idFromString } from '@kobato/utils/id.ts'

const impl = implementAdmin(adminUsersCrudContract)

const count = impl.count.handler(({ context }) => countUsers(context.db))

const passkeyFlag = impl.passkeyFlag.handler(() => isPasskeyEnabled())

const list = impl.list.handler(async ({ input, context }) => {
  const result = await listUsersForAdmin(
    context.db,
    input.offset,
    input.limit,
    {
      q: input.q,
      role: input.role,
      includeDeleted: input.includeDeleted,
      hasPosts: input.hasPosts,
      hasPages: input.hasPages,
    },
    input.sortBy,
  )
  return { users: result.users.map(toAdminUserDto), total: result.total, hasMore: result.hasMore }
})

const get = impl.get.handler(async ({ input, context }) => {
  const user = await fetchAdminUserDto(context.db, idFromString(input.id))
  if (!user) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'users.error.notFound')
  }
  return { user }
})

const update = impl.update.handler(async ({ input, context }) => {
  const { id, patch } = splitMergePatch(input)
  const updated = await updateUserById(context.db, idFromString(id), patch)
  if (updated === null) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'users.error.notFound')
  }
  recordAuditEventFromContext(context, {
    action: 'user_updated',
    resourceType: 'user',
    resourceId: id,
    details: { fields: Object.keys(patch) },
  })
  return { success: true }
})

const softDelete = impl.softDelete.handler(async ({ input, context }) => {
  const result = await softDeleteUserWithGuard(context.db, idFromString(input.id), context.viewer.id)
  recordAuditEventFromContext(context, {
    action: 'user_soft_deleted',
    resourceType: 'user',
    resourceId: input.id,
    details: { previousRole: result.previousRole },
  })
})

const restore = impl.restore.handler(async ({ input, context }) => {
  const ok = await restoreUserById(context.db, idFromString(input.id))
  if (!ok) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'users.error.notFound')
  }
  recordAuditEventFromContext(context, {
    action: 'user_restored',
    resourceType: 'user',
    resourceId: input.id,
  })
  return { success: true }
})

export const adminUsersCrudRouter = impl.router({
  count,
  passkeyFlag,
  list,
  get,
  update,
  softDelete,
  restore,
})

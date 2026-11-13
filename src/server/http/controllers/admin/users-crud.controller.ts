import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { isPasskeyEnabled } from '@/server/domains/auth/passkey/gate'
import {
  countUsers,
  fetchAdminUserDto,
  listUsersForAdmin,
  softDeleteUserWithGuard,
  toAdminUserDto,
} from '@/server/domains/users/services/admin'
import { adminProc, localizedOrpcError } from '@/server/http/orpc-base'
import { restoreUserById, updateUserById } from '@/server/infra/db/operations/user'
import { adminUsersCountOutputSchema, adminUsersPasskeyFlagOutputSchema } from '@/shared/contracts/admin'
import { clearable, mergePatchInput, splitMergePatch } from '@/shared/contracts/merge-patch'
import { adminUserDto } from '@/shared/contracts/users'
import { idFromString } from '@/shared/utils/id'
import { optionalHttpUrlSchema } from '@/shared/utils/safe-url'

const idInput = z.object({ id: z.string().min(1) })
const successOutput = z.object({ success: z.boolean() })

// Total user count for the admin layout's badge — one `count(*)`, no
// filters (the list endpoint owns the filtered count).
const count = adminProc
  .route({ method: 'GET', path: '/admin/users/count' })
  .output(adminUsersCountOutputSchema)
  .handler(({ context }) => countUsers(context.db))

// Passkey gate for the user detail page — same `isPasskeyEnabled` as the account/passkey procedures.
const passkeyFlag = adminProc
  .route({ method: 'GET', path: '/admin/users/passkey-flag' })
  .output(adminUsersPasskeyFlagOutputSchema)
  .handler(() => isPasskeyEnabled())

const list = adminProc
  .route({ method: 'GET', path: '/admin/users/list' })
  .input(
    z.object({
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(20),
      q: z.string().trim().max(100).optional(),
      role: z.enum(['all', 'admin', 'author', 'visitor', 'normal']).default('all'),
      includeDeleted: z.boolean().default(false),
      hasPosts: z.boolean().default(false),
      hasPages: z.boolean().default(false),
      sortBy: z.enum(['recent', 'commentCount']).default('recent'),
    }),
  )
  .output(z.object({ users: z.array(adminUserDto), total: z.number(), hasMore: z.boolean() }))
  .handler(async ({ input, context }) => {
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

const get = adminProc
  .route({ method: 'GET', path: '/admin/users/get' })
  .input(idInput)
  .output(z.object({ user: adminUserDto }))
  .handler(async ({ input, context }) => {
    const user = await fetchAdminUserDto(context.db, idFromString(input.id))
    if (!user) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'users.error.notFound')
    }
    return { user }
  })

const update = adminProc
  .route({ method: 'POST', path: '/admin/users/update' })
  .input(
    mergePatchInput({
      name: z.string().min(1).optional(),
      email: z.email().optional(),
      link: clearable(optionalHttpUrlSchema),
      badgeName: clearable(z.string()),
      badgeColor: z.string().optional(),
      badgeTextColor: clearable(z.string()),
    }),
  )
  .output(successOutput)
  .handler(async ({ input, context }) => {
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

const softDelete = adminProc
  .route({ method: 'POST', path: '/admin/users/soft-delete' })
  .input(idInput)
  .output(z.void())
  .handler(async ({ input, context }) => {
    const result = await softDeleteUserWithGuard(context.db, idFromString(input.id), context.viewer.id)
    recordAuditEventFromContext(context, {
      action: 'user_soft_deleted',
      resourceType: 'user',
      resourceId: input.id,
      details: { previousRole: result.previousRole },
    })
  })

const restore = adminProc
  .route({ method: 'POST', path: '/admin/users/restore' })
  .input(idInput)
  .output(successOutput)
  .handler(async ({ input, context }) => {
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

export const adminUsersCrudRouter = {
  count,
  passkeyFlag,
  list,
  get,
  update,
  softDelete,
  restore,
}

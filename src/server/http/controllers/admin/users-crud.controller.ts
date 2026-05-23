import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import {
  fetchAdminUserDto,
  listUsersForAdmin,
  restoreAdminUser,
  softDeleteAdminUser,
  toAdminUserDto,
} from '@/server/domains/users/service'
import { adminProc } from '@/server/http/orpc-base'
import { countAdmins, findUserById, updateUserById } from '@/server/infra/db/operations/user'
import { adminUserDto } from '@/shared/contracts/users'
import { idFromString } from '@/shared/utils/id'

const idInput = z.object({ id: z.string().min(1) })
const successOutput = z.object({ success: z.boolean() })

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
      sortBy: z.enum(['recent', 'commentCount']).default('recent'),
    }),
  )
  .output(z.object({ users: z.array(adminUserDto), total: z.number(), hasMore: z.boolean() }))
  .handler(async ({ input }) => {
    const result = await listUsersForAdmin(
      input.offset,
      input.limit,
      { q: input.q, role: input.role, includeDeleted: input.includeDeleted, hasPosts: input.hasPosts },
      input.sortBy,
    )
    return { users: result.users.map(toAdminUserDto), total: result.total, hasMore: result.hasMore }
  })

const get = adminProc
  .route({ method: 'GET', path: '/admin/users/get' })
  .input(idInput)
  .output(z.object({ user: adminUserDto }))
  .handler(async ({ input }) => {
    const user = await fetchAdminUserDto(idFromString(input.id))
    if (!user) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    return { user }
  })

const update = adminProc
  .route({ method: 'POST', path: '/admin/users/update' })
  .input(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).optional(),
      email: z.email().optional(),
      link: z.string().optional(),
      badgeName: z.string().optional(),
      badgeColor: z.string().optional(),
      badgeTextColor: z.union([z.string(), z.null()]).optional(),
    }),
  )
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const { id, ...patch } = input
    const updated = await updateUserById(idFromString(id), patch)
    if (updated === null) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
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
    const userId = input.id
    if (context.viewer.userId === userId) {
      throw new ORPCError('FORBIDDEN', { message: '不能删除自己。' })
    }
    const targetId = idFromString(userId)
    const target = await findUserById(targetId)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    if (target.role === 'admin') {
      const adminCount = await countAdmins()
      if (adminCount <= 1) {
        throw new ORPCError('CONFLICT', { message: '不能删除唯一的管理员。' })
      }
    }
    const ok = await softDeleteAdminUser(targetId)
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在或已被删除' })
    }
    await revokeAllSessionsOfUser(targetId)
    recordAuditEventFromContext(context, {
      action: 'user_soft_deleted',
      resourceType: 'user',
      resourceId: userId,
      details: { previousRole: target.role },
    })
  })

const restore = adminProc
  .route({ method: 'POST', path: '/admin/users/restore' })
  .input(idInput)
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const ok = await restoreAdminUser(idFromString(input.id))
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    recordAuditEventFromContext(context, {
      action: 'user_restored',
      resourceType: 'user',
      resourceId: input.id,
    })
    return { success: true }
  })

export const adminUsersCrudRouter = {
  list,
  get,
  update,
  softDelete,
  restore,
}

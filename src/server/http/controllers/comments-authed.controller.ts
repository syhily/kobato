import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { asCommentItemWire } from '@/server/domains/comments/projection'
import {
  countMyComments,
  listMyCommentEntities,
  loadMineCommentsPage,
} from '@/server/domains/comments/services/mine-comments'
import {
  cancelOwnCommentDeletion,
  editOwnComment,
  requestOwnCommentDeletion,
} from '@/server/domains/comments/services/moderate'
import { resolveEntitiesForComments } from '@/server/domains/content/entities/slug-title'
import { authedProc } from '@/server/http/orpc-base'
import {
  commentsMyCountsOutputSchema,
  commentsResolveEntityInputSchema,
  commentsResolveEntityOutputSchema,
} from '@/shared/contracts/admin'
import { ownCommentMutationDto } from '@/shared/contracts/comments'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { parseCommentEntity, serializeCommentEntity } from '@/shared/utils/comments'
import { idFromString } from '@/shared/utils/id'

const updateOwn = authedProc
  .route({ method: 'POST', path: '/comments/update-own' })
  .input(z.object({ commentId: z.string(), body: commentBodySchema }))
  .output(ownCommentMutationDto)
  .handler(async ({ input, context }) => {
    const commentId = input.commentId ? idFromString(input.commentId) : 0
    if (commentId === 0) {
      throw new ORPCError('BAD_REQUEST', { message: '缺少 commentId' })
    }
    // The edit-lock flow (ownership, delete-request fence, has-replies
    // lock, grace-window mutation, audit) lives in the comments domain.
    const updated = await editOwnComment(context.db, input.commentId, input.body, context.viewer, context)
    return { comment: asCommentItemWire(updated) }
  })

const requestDeleteOwn = authedProc
  .route({ method: 'POST', path: '/comments/request-delete-own' })
  .input(z.object({ commentId: z.string() }))
  .output(ownCommentMutationDto)
  .handler(async ({ input, context }) => {
    // The request-delete flow (ownership, idempotent no-op, mutation,
    // audit, fresh re-fetch) lives in the comments domain.
    const updated = await requestOwnCommentDeletion(context.db, input.commentId, context.viewer, context)
    return { comment: asCommentItemWire(updated) }
  })

const cancelDeleteOwn = authedProc
  .route({ method: 'POST', path: '/comments/cancel-delete-own' })
  .input(z.object({ commentId: z.string() }))
  .output(ownCommentMutationDto)
  .handler(async ({ input, context }) => {
    // The cancel-delete flow (ownership, guarded mutation, audit, fresh
    // re-fetch) lives in the comments domain.
    const updated = await cancelOwnCommentDeletion(context.db, input.commentId, context.viewer, context)
    return { comment: asCommentItemWire(updated) }
  })

const loadMine = authedProc
  .route({ method: 'GET', path: '/comments/load-mine' })
  .input(
    z.object({
      offset: z.coerce.number().min(0).default(0),
      limit: z.coerce.number().min(1).max(100).default(20),
      status: z.enum(['all', 'pending', 'deleteRequested', 'deleted']).optional(),
      q: z.string().trim().max(200).optional(),
      entity: z.string().max(2048).optional(),
    }),
  )
  .output(
    z.object({
      items: z.array(
        z.object({
          id: z.string(),
          body: commentBodySchema,
          createdAtIso: z.string(),
          deletedAtIso: z.string().nullable(),
          deleteRequestedAtIso: z.string().nullable(),
          isPending: z.boolean(),
          entity: z.object({ title: z.string(), permalink: z.string() }).nullable(),
          parent: z.object({ name: z.string(), excerpt: z.string(), isDeleted: z.boolean() }).nullable(),
        }),
      ),
      total: z.number().int(),
      hasMore: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = idFromString(context.viewer.id)
    const entity = input.entity ? parseCommentEntity(input.entity) : null
    const filters = {
      status: input.status,
      q: input.q,
      entity: entity ?? undefined,
    }
    return loadMineCommentsPage(context.db, userId, input.offset, Math.min(input.limit, 100), filters)
  })

const searchMineEntities = authedProc
  .route({ method: 'GET', path: '/comments/search-mine-entities' })
  .input(z.object({ q: z.string().trim().max(100).optional() }))
  .output(z.object({ entities: z.array(z.object({ value: z.string(), label: z.string() })) }))
  .handler(async ({ input, context }) => {
    const userId = idFromString(context.viewer.id)
    const rows = await listMyCommentEntities(context.db, userId, { q: input.q })
    return {
      entities: rows.map((e) => ({
        value: serializeCommentEntity({ type: e.type, ownerId: e.ownerId }),
        label: e.title,
      })),
    }
  })

// Comment count tuple for the profile/dashboard cards — the service's
// full `{ total, pending, deleteRequested, deleted }` passes through
// unchanged (the profile card renders all four rows).
const myCounts = authedProc
  .route({ method: 'GET', path: '/comments/my-counts' })
  .output(commentsMyCountsOutputSchema)
  .handler(async ({ context }) => countMyComments(context.db, idFromString(context.viewer.id)))

// Follow-up entity resolve for `/admin/me/comments`: when the URL pins an
// entity that is not in the mine-comments entity dropdown, the loader
// asks here for its title. Malformed keys and hard-deleted entities
// answer `null` — the loader keeps the pinned raw key in that case.
const resolveEntity = authedProc
  .route({ method: 'GET', path: '/comments/resolve-entity' })
  .input(commentsResolveEntityInputSchema)
  .output(commentsResolveEntityOutputSchema)
  .handler(async ({ input, context }) => {
    const parsed = parseCommentEntity(input.entity)
    if (parsed === null) {
      return null
    }
    const resolved = await resolveEntitiesForComments(context.db, [parsed])
    const hit = resolved.get(serializeCommentEntity(parsed))
    return hit === undefined ? null : { value: serializeCommentEntity(parsed), label: hit.title }
  })

export const commentsAuthedRouter = {
  updateOwn,
  requestDeleteOwn,
  cancelDeleteOwn,
  loadMine,
  searchMineEntities,
  myCounts,
  resolveEntity,
}

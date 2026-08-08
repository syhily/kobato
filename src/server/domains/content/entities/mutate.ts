import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@/server/domains/content/entities/descriptor'
import type { Database } from '@/server/infra/db/database'

import { rescheduleScheduledPublish } from '@/server/domains/content/scheduled-publish'
import { rethrowSlugConflict } from '@/server/domains/content/slug-conflict'
import { reclaimSlugOnRestore } from '@/server/domains/content/slug-reclaim'
import {
  deleteSlugRegistryByEntity,
  insertSlugRegistry,
  updateSlugRegistryByEntity,
} from '@/server/infra/db/operations/slug-registry'
import { DomainError } from '@/server/infra/http/errors'
import { reserveSlugInTransaction } from '@/server/infra/slug/reservation'
import { resolveSlug } from '@/server/infra/slug/resolve'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface EntityMutations<TInput extends UpsertMetaInputBase, TAdminDto> {
  create: (db: Database, input: TInput, authorId: number | null, viewer?: ViewerIdentity) => Promise<TAdminDto>
  update: (db: Database, input: TInput & { id: number }, viewer?: ViewerIdentity) => Promise<TAdminDto>
  remove: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<{ deleted: boolean }>
  restore: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<{ restored: boolean; warning?: string }>
  unpublish: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<TAdminDto>
}

/**
 * The five-function meta-mutation skeleton every content entity shares;
 * all entity behavior attaches through the descriptor hooks.
 */
export function makeEntityMutations<
  TMeta extends MetaRowBase,
  TNew,
  TInput extends UpsertMetaInputBase,
  TExtras extends object,
  TAdminDto,
  TRestore,
>(
  descriptor: MetaEntityDescriptor<TMeta, TNew, TInput, TExtras, TAdminDto, unknown, TRestore>,
): EntityMutations<TInput, TAdminDto> {
  const { repos, mutations } = descriptor

  /**
   * `db.transaction` without drizzle's Promise-guard conditional —
   * every callback here is sync by construction (node:sqlite).
   */
  function syncTransaction<T>(db: Database, fn: (tx: Database) => T): T {
    return unsafeCast<(fn: (tx: Database) => T) => T>(db.transaction.bind(db))(fn)
  }

  async function create(
    db: Database,
    input: TInput,
    authorId: number | null,
    viewer?: ViewerIdentity,
  ): Promise<TAdminDto> {
    const resolvedAuthorId = mutations.resolveAuthorId?.(authorId, viewer) ?? authorId
    const slug = resolveSlug(input.slug, input.title, { entity: descriptor.entityType })
    await mutations.preflightUpsert?.(db, input)
    const now = new Date()
    try {
      const row = syncTransaction(db, (tx) => {
        // Check + insert in one transaction; writers serialise on the single connection.
        reserveSlugInTransaction(tx, descriptor.entityType, slug, undefined, {
          findOwnMetaBySlugForUpdate: repos.findMetaBySlugForUpdate,
        })
        const inserted = repos.insertMeta(
          tx,
          // Shared columns + insertExtras build the row; the table union guarantees the shape.
          unsafeCast<TNew>({
            slug,
            title: input.title,
            summary: input.summary ?? '',
            cover: input.cover ?? '',
            og: input.og ?? null,
            published: false,
            commentsEnabled: input.commentsEnabled ?? true,
            webmentionsEnabled: input.webmentionsEnabled ?? true,
            showToc: input.showToc ?? false,
            showUpdated: input.showUpdated ?? false,
            publishedAt: input.publishedAt ?? now,
            authorId: resolvedAuthorId,
            ...mutations.insertExtras(input),
          }),
        )
        mutations.syncRelations?.(tx, inserted.id, input)
        insertSlugRegistry(tx, { slug, entityType: descriptor.entityType, entityId: inserted.id })
        return inserted
      })
      await mutations.afterMutation?.(db, row, 'create')
      const extras = await mutations.mutationExtras?.(db, row, { kind: 'upsert', input })
      return descriptor.adminDto.project(row, extras)
    } catch (err) {
      rethrowSlugConflict(err, descriptor.entityType, slug)
    }
  }

  async function update(db: Database, input: TInput & { id: number }, viewer?: ViewerIdentity): Promise<TAdminDto> {
    const id = input.id
    const slug = resolveSlug(input.slug, input.title, { entity: descriptor.entityType })
    const existing = repos.findMetaById(db, id)
    descriptor.access.assertAccess(existing, viewer)
    await mutations.preflightUpsert?.(db, input)
    const now = new Date()
    try {
      const updated = syncTransaction(db, (tx) => {
        if (existing.slug !== slug) {
          reserveSlugInTransaction(tx, descriptor.entityType, slug, id, {
            findOwnMetaBySlugForUpdate: repos.findMetaBySlugForUpdate,
          })
        }
        const result = repos.updateMetaById(tx, id, {
          slug,
          title: input.title,
          summary: input.summary ?? existing.summary,
          cover: input.cover ?? existing.cover,
          og: input.og === undefined ? existing.og : input.og,
          commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
          webmentionsEnabled: input.webmentionsEnabled ?? existing.webmentionsEnabled,
          showToc: input.showToc ?? existing.showToc,
          showUpdated: input.showUpdated ?? existing.showUpdated,
          // `null` cancels the schedule — drop the timestamp, flip back to unpublished.
          publishedAt: input.publishedAt === undefined ? existing.publishedAt : (input.publishedAt ?? now),
          ...(input.publishedAt === null ? { published: false } : {}),
          ...mutations.updateExtras(input, existing),
        } as Partial<Omit<TNew, 'id' | 'createdAt'>>)
        if (result !== null) {
          mutations.syncRelations?.(tx, id, input)
          if (existing.slug !== slug) {
            updateSlugRegistryByEntity(tx, { entityType: descriptor.entityType, entityId: id, slug })
          }
        }
        return result
      })
      if (updated === null) {
        throw new DomainError('NOT_FOUND', `${descriptor.label}不存在或已被删除。`)
      }
      await mutations.afterMutation?.(db, updated, 'update')
      // `publishedAt` may have been set/moved/cancelled — re-arm the timer (no-op until started).
      rescheduleScheduledPublish()
      const extras = await mutations.mutationExtras?.(db, updated, { kind: 'upsert', input })
      return descriptor.adminDto.project(updated, extras)
    } catch (err) {
      rethrowSlugConflict(err, descriptor.entityType, slug)
    }
  }

  async function remove(db: Database, id: number, viewer?: ViewerIdentity): Promise<{ deleted: boolean }> {
    const meta = repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)
    const deleted = db.transaction((tx) => {
      const ok = repos.softDeleteMeta(tx, id)
      if (ok) {
        mutations.deleteRelations?.(tx, id)
        deleteSlugRegistryByEntity(tx, { entityType: descriptor.entityType, entityId: id })
      }
      return ok
    })
    if (deleted) {
      await mutations.afterMutation?.(db, meta, 'delete')
      // A deleted scheduled row is no longer the next one — re-arm.
      rescheduleScheduledPublish()
    }
    return { deleted }
  }

  async function restore(
    db: Database,
    id: number,
    viewer?: ViewerIdentity,
  ): Promise<{ restored: boolean; warning?: string }> {
    const meta = repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)

    // Gather post-commit needs inside the tx so a failed restore never touches external state.
    const { restored, slugWarning, ctx } = db.transaction((tx) => {
      const ok = repos.restoreMeta(tx, id)
      let slugConflict: string | undefined
      let restoreCtx: TRestore | null | undefined
      if (ok) {
        const restoredMeta = repos.findMetaById(tx, id)
        if (restoredMeta !== null) {
          slugConflict = reclaimSlugOnRestore(tx, descriptor.entityType, id, restoredMeta.slug)
          restoreCtx = mutations.prepareRestore?.(tx, restoredMeta)
        }
      }
      return { restored: ok, slugWarning: slugConflict, ctx: restoreCtx }
    })

    let restoreWarning: string | undefined
    if (restored) {
      // `restored` implies the tx gathered a context (possibly the descriptor's own null/undefined).
      restoreWarning = await mutations.afterRestore?.(db, unsafeCast<TRestore>(ctx))
      // A restored scheduled row may be the next one now — re-arm.
      rescheduleScheduledPublish()
    }
    const warning = [slugWarning, restoreWarning].filter((part) => part !== undefined).join(' ') || undefined
    return { restored, warning }
  }

  async function unpublish(db: Database, id: number, viewer?: ViewerIdentity): Promise<TAdminDto> {
    const existing = repos.findMetaById(db, id)
    descriptor.access.assertAccess(existing, viewer)
    const updated = repos.updateMetaById(
      db,
      id,
      // Single-column patch; structural across the table union.
      unsafeCast<Partial<Omit<TNew, 'id' | 'createdAt'>>>({ published: false }),
    )
    if (updated === null) {
      throw new DomainError('NOT_FOUND', `${descriptor.label}不存在或已被删除。`)
    }
    await mutations.afterMutation?.(db, updated, 'unpublish')
    // Unpublishing drops the row from the scheduled set — re-arm.
    rescheduleScheduledPublish()
    const extras = await mutations.mutationExtras?.(db, updated, { kind: 'unpublish' })
    return descriptor.adminDto.project(updated, extras)
  }

  return { create, update, remove, restore, unpublish }
}

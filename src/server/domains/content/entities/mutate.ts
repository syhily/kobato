import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@/server/domains/content/entities/descriptor'

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
  create: (db: NodePgDatabase, input: TInput, authorId: bigint | null, viewer?: ViewerIdentity) => Promise<TAdminDto>
  update: (db: NodePgDatabase, input: TInput & { id: bigint }, viewer?: ViewerIdentity) => Promise<TAdminDto>
  remove: (db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) => Promise<{ deleted: boolean }>
  restore: (db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) => Promise<{ restored: boolean; warning?: string }>
  unpublish: (db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity) => Promise<TAdminDto>
}

/**
 * The five-function meta-mutation skeleton every content entity shares:
 * resolve slug → reserve in-transaction → meta write → relation/registry
 * sync → post-commit side effects, with slug unique-constraint → CONFLICT
 * mapping. All entity behavior attaches through the descriptor hooks —
 * see `entities/descriptor.ts`. Restore re-claims the slug inside the
 * transaction and space-joins its warning ahead of `afterRestore`'s.
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

  async function create(
    db: NodePgDatabase,
    input: TInput,
    authorId: bigint | null,
    viewer?: ViewerIdentity,
  ): Promise<TAdminDto> {
    const resolvedAuthorId = mutations.resolveAuthorId?.(authorId, viewer) ?? authorId
    const slug = resolveSlug(input.slug, input.title, { entity: descriptor.entityType })
    await mutations.preflightUpsert?.(db, input)
    const now = new Date()
    try {
      const row = await db.transaction(async (tx) => {
        // Lock slug rows so concurrent creation with the same slug serialises.
        await reserveSlugInTransaction(tx, descriptor.entityType, slug, undefined, {
          findOwnMetaBySlugForUpdate: repos.findMetaBySlugForUpdate,
        })
        const inserted = await repos.insertMeta(
          tx,
          // Shared columns + insertExtras build the row structurally; the
          // table union guarantees the shape at runtime.
          unsafeCast<TNew>({
            slug,
            title: input.title,
            summary: input.summary ?? '',
            cover: input.cover ?? '',
            og: input.og ?? null,
            published: false,
            commentsEnabled: input.commentsEnabled ?? true,
            showToc: input.showToc ?? false,
            showUpdated: input.showUpdated ?? false,
            publishedAt: input.publishedAt ?? now,
            authorId: resolvedAuthorId,
            ...mutations.insertExtras(input),
          }),
        )
        await mutations.syncRelations?.(tx, inserted.id, input)
        await insertSlugRegistry(tx, { slug, entityType: descriptor.entityType, entityId: inserted.id })
        return inserted
      })
      await mutations.afterMutation?.(db, row, 'create')
      const extras = await mutations.mutationExtras?.(db, row, { kind: 'upsert', input })
      return descriptor.adminDto.project(row, extras)
    } catch (err) {
      rethrowSlugConflict(err, descriptor.entityType, slug)
    }
  }

  async function update(
    db: NodePgDatabase,
    input: TInput & { id: bigint },
    viewer?: ViewerIdentity,
  ): Promise<TAdminDto> {
    const id = input.id
    const slug = resolveSlug(input.slug, input.title, { entity: descriptor.entityType })
    const existing = await repos.findMetaById(db, id)
    descriptor.access.assertAccess(existing, viewer)
    await mutations.preflightUpsert?.(db, input)
    try {
      const updated = await db.transaction(async (tx) => {
        if (existing.slug !== slug) {
          await reserveSlugInTransaction(tx, descriptor.entityType, slug, id, {
            findOwnMetaBySlugForUpdate: repos.findMetaBySlugForUpdate,
          })
        }
        const result = await repos.updateMetaById(tx, id, {
          slug,
          title: input.title,
          summary: input.summary ?? existing.summary,
          cover: input.cover ?? existing.cover,
          og: input.og === undefined ? existing.og : input.og,
          commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
          showToc: input.showToc ?? existing.showToc,
          showUpdated: input.showUpdated ?? existing.showUpdated,
          publishedAt: input.publishedAt ?? existing.publishedAt,
          ...mutations.updateExtras(input, existing),
        } as Partial<Omit<TNew, 'id' | 'createdAt'>>)
        if (result !== null) {
          await mutations.syncRelations?.(tx, id, input)
          if (existing.slug !== slug) {
            await updateSlugRegistryByEntity(tx, { entityType: descriptor.entityType, entityId: id, slug })
          }
        }
        return result
      })
      if (updated === null) {
        throw new DomainError('NOT_FOUND', `${descriptor.label}不存在或已被删除。`)
      }
      await mutations.afterMutation?.(db, updated, 'update')
      const extras = await mutations.mutationExtras?.(db, updated, { kind: 'upsert', input })
      return descriptor.adminDto.project(updated, extras)
    } catch (err) {
      rethrowSlugConflict(err, descriptor.entityType, slug)
    }
  }

  async function remove(db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity): Promise<{ deleted: boolean }> {
    const meta = await repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)
    const deleted = await db.transaction(async (tx) => {
      const ok = await repos.softDeleteMeta(tx, id)
      if (ok) {
        await mutations.deleteRelations?.(tx, id)
        await deleteSlugRegistryByEntity(tx, { entityType: descriptor.entityType, entityId: id })
      }
      return ok
    })
    if (deleted) {
      await mutations.afterMutation?.(db, meta, 'delete')
    }
    return { deleted }
  }

  async function restore(
    db: NodePgDatabase,
    id: bigint,
    viewer?: ViewerIdentity,
  ): Promise<{ restored: boolean; warning?: string }> {
    const meta = await repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)

    // Gather everything the post-commit side effects need inside the
    // transaction so a failed restore never touches external state
    // (posts: the search index).
    const { restored, slugWarning, ctx } = await db.transaction(async (tx) => {
      const ok = await repos.restoreMeta(tx, id)
      let slugConflict: string | undefined
      let restoreCtx: TRestore | undefined
      if (ok) {
        const restoredMeta = await repos.findMetaById(tx, id)
        if (restoredMeta !== null) {
          slugConflict = await reclaimSlugOnRestore(tx, descriptor.entityType, id, restoredMeta.slug)
          restoreCtx = await mutations.prepareRestore?.(tx, restoredMeta)
        }
      }
      return { restored: ok, slugWarning: slugConflict, ctx: restoreCtx }
    })

    let restoreWarning: string | undefined
    if (restored) {
      // `restored` implies the tx gathered a context (possibly the descriptor's own null/undefined).
      restoreWarning = await mutations.afterRestore?.(db, unsafeCast<TRestore>(ctx))
    }
    const warning = [slugWarning, restoreWarning].filter((part) => part !== undefined).join(' ') || undefined
    return { restored, warning }
  }

  async function unpublish(db: NodePgDatabase, id: bigint, viewer?: ViewerIdentity): Promise<TAdminDto> {
    const existing = await repos.findMetaById(db, id)
    descriptor.access.assertAccess(existing, viewer)
    const updated = await repos.updateMetaById(
      db,
      id,
      // Single-column patch; structural across the table union.
      unsafeCast<Partial<Omit<TNew, 'id' | 'createdAt'>>>({ published: false }),
    )
    if (updated === null) {
      throw new DomainError('NOT_FOUND', `${descriptor.label}不存在或已被删除。`)
    }
    await mutations.afterMutation?.(db, updated, 'unpublish')
    const extras = await mutations.mutationExtras?.(db, updated, { kind: 'unpublish' })
    return descriptor.adminDto.project(updated, extras)
  }

  return { create, update, remove, restore, unpublish }
}

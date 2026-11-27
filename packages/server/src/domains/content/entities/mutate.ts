import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { Database } from '@kobato/db/sqlite/database'
import type { NewPageMeta, NewPostMeta } from '@kobato/db/sqlite/types'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type {
  MetaEntityDescriptor,
  MetaRowBase,
  UpsertMetaInputBase,
} from '@kobato/server/domains/content/entities/descriptor'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import {
  createEntityWithSlug,
  restoreEntityReclaimingSlug,
  softDeleteEntityWithSlug,
  updateEntityWithSlug,
} from '@kobato/db/sqlite/operations/content/entity-lifecycle'
import { SlugOccupiedError, updateEntityMetaById } from '@kobato/db/sqlite/operations/content/entity-meta'
import { rescheduleScheduledPublish } from '@kobato/server/domains/content/scheduled-publish'
import { resolveContentLanguage } from '@kobato/server/domains/content/schemas/meta-fields'
import { rethrowSlugConflict } from '@kobato/server/domains/content/slug-conflict'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { resolveSlug } from '@kobato/server/infra/slug/resolve'

export interface EntityMutations<TInput extends UpsertMetaInputBase, TAdminDto> {
  create: (db: Database, input: TInput, authorId: number | null, viewer?: ViewerIdentity) => Promise<TAdminDto>
  update: (db: Database, input: TInput & { id: number }, viewer?: ViewerIdentity) => Promise<TAdminDto>
  remove: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<{ deleted: boolean }>
  restore: (
    db: Database,
    id: number,
    viewer?: ViewerIdentity,
  ) => Promise<{ restored: boolean; warningDescriptors?: ErrorMessageDescriptor[] }>
  unpublish: (db: Database, id: number, viewer?: ViewerIdentity) => Promise<TAdminDto>
}

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

  function tagSeedsFor(input: TInput): { name: string; slug: string }[] | undefined {
    if (mutations.tagSeedsFor === undefined) {
      return undefined
    }
    return mutations.tagSeedsFor(input)
  }

  function mapSlugOccupied(err: unknown, entityType: 'post' | 'page', slug: string): never {
    if (err instanceof SlugOccupiedError) {
      throw new DomainError(
        'CONFLICT',
        descriptorFor('content.error.slugTakenByEntity', { slug, entity: err.occupantType }),
      )
    }
    rethrowSlugConflict(err, entityType, slug)
  }

  async function create(
    db: Database,
    input: TInput,
    authorId: number | null,
    viewer?: ViewerIdentity,
  ): Promise<TAdminDto> {
    const resolvedAuthorId = mutations.resolveAuthorId?.(authorId, viewer) ?? authorId
    const contentLanguage = resolveContentLanguage(input.contentLanguage)
    const slug = resolveSlug(input.slug, input.title, { entity: descriptor.entityType })
    await mutations.preflightUpsert?.(db, input)
    const now = new Date()
    try {
      const row = unsafeCast<TMeta>(
        createEntityWithSlug(db, {
          entityType: descriptor.entityType,
          slug,
          values: unsafeCast<NewPostMeta | NewPageMeta>({
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
            contentLanguage: contentLanguage ?? null,
            publishedAt: input.publishedAt ?? now,
            authorId: resolvedAuthorId,
            ...mutations.insertExtras(input),
          }),
          tagSeeds: tagSeedsFor(input),
        }),
      )
      await mutations.afterMutation?.(db, row, 'create')
      const extras = await mutations.mutationExtras?.(db, row, { kind: 'upsert', input })
      return descriptor.adminDto.project(row, extras)
    } catch (err) {
      mapSlugOccupied(err, descriptor.entityType, slug)
    }
  }

  async function update(db: Database, input: TInput & { id: number }, viewer?: ViewerIdentity): Promise<TAdminDto> {
    const id = input.id
    const contentLanguage = resolveContentLanguage(input.contentLanguage)
    const slug = resolveSlug(input.slug, input.title, { entity: descriptor.entityType })
    const existing = repos.findMetaById(db, id)
    descriptor.access.assertAccess(existing, viewer)
    await mutations.preflightUpsert?.(db, input)
    const now = new Date()
    try {
      const updated = unsafeCast<TMeta | null>(
        updateEntityWithSlug(db, {
          entityType: descriptor.entityType,
          id,
          slug,
          slugChanged: existing.slug !== slug,
          patch: unsafeCast<Partial<NewPostMeta> | Partial<NewPageMeta>>({
            slug,
            title: input.title,
            summary: input.summary ?? existing.summary,
            cover: input.cover ?? existing.cover,
            og: input.og === undefined ? existing.og : input.og,
            commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
            webmentionsEnabled: input.webmentionsEnabled ?? existing.webmentionsEnabled,
            showToc: input.showToc ?? existing.showToc,
            showUpdated: input.showUpdated ?? existing.showUpdated,
            contentLanguage: contentLanguage === undefined ? existing.contentLanguage : contentLanguage,
            publishedAt: input.publishedAt === undefined ? existing.publishedAt : (input.publishedAt ?? now),
            ...(input.publishedAt === null ? { published: false } : {}),
            ...mutations.updateExtras(input, existing),
          }),
          tagSeeds: tagSeedsFor(input),
        }),
      )
      if (updated === null) {
        throw new DomainError(
          'NOT_FOUND',
          descriptorFor('content.error.entityNotFound', { entity: descriptor.entityType }),
        )
      }
      await mutations.afterMutation?.(db, updated, 'update')
      rescheduleScheduledPublish()
      const extras = await mutations.mutationExtras?.(db, updated, { kind: 'upsert', input })
      return descriptor.adminDto.project(updated, extras)
    } catch (err) {
      mapSlugOccupied(err, descriptor.entityType, slug)
    }
  }

  async function remove(db: Database, id: number, viewer?: ViewerIdentity): Promise<{ deleted: boolean }> {
    const meta = repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)
    const deleted = softDeleteEntityWithSlug(db, descriptor.entityType, id)
    if (deleted) {
      await mutations.afterMutation?.(db, meta, 'delete')
      rescheduleScheduledPublish()
    }
    return { deleted }
  }

  async function restore(
    db: Database,
    id: number,
    viewer?: ViewerIdentity,
  ): Promise<{ restored: boolean; warningDescriptors?: ErrorMessageDescriptor[] }> {
    const meta = repos.findMetaById(db, id)
    descriptor.access.assertAccess(meta, viewer)

    const result = restoreEntityReclaimingSlug(db, descriptor.entityType, id)

    let slugWarning: ErrorMessageDescriptor | undefined
    let restoreWarning: ErrorMessageDescriptor | undefined
    if (result.restored && result.meta !== null) {
      const restoredMeta = unsafeCast<TMeta>(result.meta)
      if (result.slugConflict !== undefined) {
        slugWarning = descriptorFor('content.warning.slugTakenOnRestore', {
          slug: restoredMeta.slug,
          occupant: result.slugConflict.occupantType,
          target: descriptor.entityType,
        })
      } else if (result.slugStolen === true) {
        slugWarning = descriptorFor('content.warning.slugStolenOnRestore', {
          slug: restoredMeta.slug,
          target: descriptor.entityType,
        })
      }
      const ctx = mutations.buildRestoreContext?.(result) ?? null
      restoreWarning = await mutations.afterRestore?.(db, unsafeCast<TRestore>(ctx))
      rescheduleScheduledPublish()
    }

    const warningDescriptors = [slugWarning, restoreWarning].filter(
      (part): part is ErrorMessageDescriptor => part !== undefined,
    )
    return { restored: result.restored, ...(warningDescriptors.length === 0 ? {} : { warningDescriptors }) }
  }

  async function unpublish(db: Database, id: number, viewer?: ViewerIdentity): Promise<TAdminDto> {
    const existing = repos.findMetaById(db, id)
    descriptor.access.assertAccess(existing, viewer)
    const updated = unsafeCast<TMeta | null>(
      updateEntityMetaById(
        db,
        descriptor.entityType,
        id,
        unsafeCast<Partial<NewPostMeta> | Partial<NewPageMeta>>({ published: false }),
      ),
    )
    if (updated === null) {
      throw new DomainError(
        'NOT_FOUND',
        descriptorFor('content.error.entityNotFound', { entity: descriptor.entityType }),
      )
    }
    await mutations.afterMutation?.(db, updated, 'unpublish')
    rescheduleScheduledPublish()
    const extras = await mutations.mutationExtras?.(db, updated, { kind: 'unpublish' })
    return descriptor.adminDto.project(updated, extras)
  }

  return { create, update, remove, restore, unpublish }
}

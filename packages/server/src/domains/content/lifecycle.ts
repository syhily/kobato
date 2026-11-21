import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'
import type { AdminRevisionDto } from '@kobato/contracts/revision'
import type { Database } from '@kobato/db/database'
import type { ContentRow } from '@kobato/db/types'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { ContentType, PublishLatestResult, SaveDraftResult } from '@kobato/server/domains/content/schemas/revision'
import type { MusicEmbedResolver } from '@kobato/server/domains/content/services/lexical/embeds'

import { collectLexicalHeadings, collectLexicalImageStoragePaths } from '@kobato/inkling/headless/collect'
import { compactLexicalEditorState } from '@kobato/inkling/headless/dialect'
import { toAdminRevisionDto } from '@kobato/server/domains/content/projection'
import {
  isEquivalentToPublishedLatest,
  publishLatestRevision,
  saveDraftRevision,
} from '@kobato/server/domains/content/repos/mutate'
import { findContentById, findLatestDraft, findLatestRevision } from '@kobato/server/domains/content/revisions'
import { rescheduleScheduledPublish } from '@kobato/server/domains/content/scheduled-publish'
import { syncLibraryImageBlocks } from '@kobato/server/domains/content/services/image-sync'
import { canonicalizeLexicalEditorState } from '@kobato/server/domains/content/services/lexical/canonicalize'
import { snapshotMusicPlayerMeta } from '@kobato/server/domains/content/services/lexical/music-snapshot'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { computeBodyProjections, type BodyProjections } from '@kobato/server/infra/lexical/lexical-projection'
import { getLogger, type Logger } from '@kobato/server/infra/logger'

const log = getLogger('content.lifecycle')

export interface ContentEntityAdapter<TMeta, TPreview> {
  entityType: ContentType
  findMetaById(db: Database, id: number): TMeta | null
  findPublicMetaBySlug(db: Database, slug: string): TMeta | null
  assertAccess(meta: TMeta | null, viewer?: ViewerIdentity): asserts meta is TMeta
  canPreviewDraft(viewer: ViewerIdentity | undefined, meta: TMeta): boolean
  getId(meta: TMeta): number
  getPublishedRevisionId(meta: TMeta): number | null
  projectPreview(meta: TMeta, revision: ContentRow | null): TPreview
  recordForceOverwrite(entry: ForceOverwriteEntry<TMeta>): void
  afterPublish(db: Database, meta: TMeta, body: LexicalEditorState, warnings: ErrorMessageDescriptor[]): Promise<void>
}

export interface ForceOverwriteEntry<TMeta> {
  mode: 'draft' | 'publish'
  authorId: number | null
  meta: TMeta
  overwritten: ContentRow
  expectedClientRevisionToken?: string | null
  resultRow: ContentRow
}

export function recordForceOverwriteAudit<TMeta extends { id: number }>(
  auditLog: Logger,
  metaIdKey: 'postMetaId' | 'pageMetaId',
  entry: ForceOverwriteEntry<TMeta>,
): void {
  auditLog.info('force_overwrite_save', {
    mode: entry.mode,
    actor: entry.authorId === null ? null : entry.authorId.toString(),
    [metaIdKey]: entry.meta.id.toString(),
    overwrittenRevisionId: entry.overwritten.id.toString(),
    overwrittenRevisionToken: entry.overwritten.clientRevisionToken,
    clientExpectedToken: entry.expectedClientRevisionToken ?? null,
    resultRevisionId: entry.resultRow.id.toString(),
  })
}

export interface SaveBodyInput {
  entityId: number
  body: unknown
  resolveMusicEmbeds: MusicEmbedResolver
  expectedClientRevisionToken?: string | null
  force?: boolean
  authorId: number | null
  publishedAt?: Date
}

export type SaveBodyResult =
  | { status: 'saved'; revision: AdminRevisionDto; warning?: string }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      expectedToken: string
      warning?: string
    }

export interface DraftPreviewResult<TPreview> {
  preview: TPreview
  hasNewerDraft: boolean
}

export type SaveBodyOutcome = SaveBodyResult & { warningDescriptors: ErrorMessageDescriptor[] }

export async function saveBody<TMeta, TPreview>(
  db: Database,
  adapter: ContentEntityAdapter<TMeta, TPreview>,
  input: SaveBodyInput,
  mode: 'draft' | 'publish',
  viewer?: ViewerIdentity,
): Promise<SaveBodyOutcome> {
  const meta = adapter.findMetaById(db, input.entityId)
  adapter.assertAccess(meta, viewer)
  const body = await canonicalizeLexicalEditorState(input.body)
  await snapshotMusicPlayerMeta(body, input.resolveMusicEmbeds)

  const warnings: ErrorMessageDescriptor[] = []

  try {
    await syncLibraryImageBlocks(db, body)
  } catch (err: unknown) {
    log.warn('sync library image blocks failed', {
      entityType: adapter.entityType,
      entityId: input.entityId,
      error: err,
    })
    warnings.push(descriptorFor('content.warning.imageSyncFailed'))
  }

  const imageSources = collectLexicalImageStoragePaths(body)
  const headings = collectLexicalHeadings(body)

  const overwriteContext =
    input.force === true ? await findLatestRevision(db, adapter.entityType, adapter.getId(meta)) : null

  const repoInput = {
    ownerId: adapter.getId(meta),
    body: compactLexicalEditorState(body),
    imageSources,
    headings,
    authorId: input.authorId,
    expectedClientRevisionToken: input.expectedClientRevisionToken,
    force: input.force,
  }

  const latestForProjectionCheck =
    overwriteContext ??
    (mode === 'draft' ? ((await findLatestRevision(db, adapter.entityType, adapter.getId(meta))) ?? undefined) : null)
  let projections: BodyProjections | null = null
  if (!(mode === 'draft' && isEquivalentToPublishedLatest(latestForProjectionCheck ?? undefined, repoInput))) {
    try {
      projections = await computeBodyProjections(body)
    } catch (err: unknown) {
      log.warn('body projection computation failed; projection columns left untouched', {
        entityType: adapter.entityType,
        entityId: input.entityId,
        error: err,
      })
      warnings.push(descriptorFor('content.warning.projectionFailed'))
    }
  }

  const result =
    mode === 'draft'
      ? await saveDraftRevision(db, adapter.entityType, { ...repoInput, projections })
      : await publishLatestRevision(db, adapter.entityType, {
          ...repoInput,
          projections,
          publishedAt: input.publishedAt,
        })

  const wroteSuccessfully = result.status === 'saved' || result.status === 'published'
  if (input.force === true && wroteSuccessfully && overwriteContext !== null) {
    if (
      input.expectedClientRevisionToken === undefined ||
      input.expectedClientRevisionToken !== overwriteContext.clientRevisionToken
    ) {
      adapter.recordForceOverwrite({
        mode,
        authorId: input.authorId,
        meta,
        overwritten: overwriteContext,
        expectedClientRevisionToken: input.expectedClientRevisionToken,
        resultRow: result.row,
      })
    }
  }
  if (mode === 'publish' && wroteSuccessfully) {
    const publishedMeta = adapter.findMetaById(db, input.entityId) ?? meta
    await adapter.afterPublish(db, publishedMeta, body, warnings)
    rescheduleScheduledPublish()
  }
  return { ...projectSaveResult(result), warningDescriptors: warnings }
}

export async function loadDraftPreviewBySlug<TMeta, TPreview>(
  db: Database,
  adapter: ContentEntityAdapter<TMeta, TPreview>,
  slug: string,
  viewer: ViewerIdentity | undefined,
): Promise<DraftPreviewResult<TPreview> | null> {
  const meta = adapter.findPublicMetaBySlug(db, slug)
  if (meta === null || !adapter.canPreviewDraft(viewer, meta)) {
    return null
  }
  const draft = await findLatestDraft(db, adapter.entityType, adapter.getId(meta))
  const publishedRevisionId = adapter.getPublishedRevisionId(meta)
  let revision: ContentRow | null = draft
  if (revision === null && publishedRevisionId !== null) {
    revision = findContentById(db, publishedRevisionId)
  }
  return { preview: adapter.projectPreview(meta, revision), hasNewerDraft: draft !== null }
}

function projectSaveResult(result: SaveDraftResult | PublishLatestResult): SaveBodyResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row) }
}

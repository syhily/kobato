import type { Database } from '@kobato/db/database.ts'
import type { ContentRow } from '@kobato/db/types.ts'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'
import type {
  ContentType,
  PublishLatestResult,
  SaveDraftResult,
} from '@kobato/server/domains/content/schemas/revision.ts'
import type { MusicEmbedResolver } from '@kobato/server/domains/pt/embeds.ts'
import type { ErrorMessageDescriptor } from '@kobato/shared/contracts/api-error.ts'
import type { AdminRevisionDto } from '@kobato/shared/contracts/revision.ts'
import type { LexicalEditorState } from '@kobato/shared/lexical/schema.ts'

import { toAdminRevisionDto } from '@kobato/server/domains/content/projection.ts'
import {
  isEquivalentToPublishedLatest,
  publishLatestRevision,
  saveDraftRevision,
} from '@kobato/server/domains/content/repos/mutate.ts'
import { findContentById, findLatestDraft, findLatestRevision } from '@kobato/server/domains/content/revisions.ts'
import { rescheduleScheduledPublish } from '@kobato/server/domains/content/scheduled-publish.ts'
import { syncLibraryImageBlocks } from '@kobato/server/domains/content/services/image-sync.ts'
import { snapshotMusicPlayerMeta } from '@kobato/server/domains/pt/lexical-music-snapshot.ts'
import { canonicalizeLexicalEditorState } from '@kobato/server/domains/pt/services/lexical-canonicalize.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { getLogger, type Logger } from '@kobato/server/infra/logger.ts'
import { computeBodyProjections, type BodyProjections } from '@kobato/server/infra/pt/lexical-projection.ts'
import { collectLexicalHeadings, collectLexicalImageStoragePaths } from '@kobato/shared/lexical/collect.ts'
import { compactLexicalEditorState } from '@kobato/shared/lexical/dialect.ts'

const log = getLogger('content.lifecycle')

/** Entity-agnostic draft→publish lifecycle for content revisions; entity behavior attaches through this adapter. */
export interface ContentEntityAdapter<TMeta, TPreview> {
  entityType: ContentType
  findMetaById(db: Database, id: number): TMeta | null
  findPublicMetaBySlug(db: Database, slug: string): TMeta | null
  assertAccess(meta: TMeta | null, viewer?: ViewerIdentity): asserts meta is TMeta
  /** Draft-preview gate, owned by the entity descriptor; callers fall through to the published page when it refuses. */
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
  /** The latest revision the force save overwrote. */
  overwritten: ContentRow
  expectedClientRevisionToken?: string | null
  resultRow: ContentRow
}

/** Shared `force_overwrite_save` audit payload; the logger scope and meta id key stay with the caller. */
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
  /**
   * Music-domain resolver wired by the controller (pt must not depend on music);
   * resolves `music-player` playerIds into the snapshot embedded at save time.
   */
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
      /** Token the editor must echo on the next attempt. */
      expectedToken: string
      warning?: string
    }

export interface DraftPreviewResult<TPreview> {
  preview: TPreview
  /** True when a draft revision is newer than `publishedRevisionId`; `preview` holds the draft then. */
  hasNewerDraft: boolean
}

/** Save outcome plus its non-fatal side-effect notices; the oRPC boundary localizes them into the wire `warning`. */
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

  // Audit context = the latest revision of any status. A read error here
  // propagates and aborts the save rather than drop the overwrite's audit row.
  const overwriteContext =
    input.force === true ? await findLatestRevision(db, adapter.entityType, adapter.getId(meta)) : null

  const repoInput = {
    ownerId: adapter.getId(meta),
    // Stored in the compact dialect; every read heals through the schema's normalize
    // preprocess, so the no-op short-circuit and revision DTOs see the full dialect.
    body: compactLexicalEditorState(body),
    imageSources,
    headings,
    authorId: input.authorId,
    expectedClientRevisionToken: input.expectedClientRevisionToken,
    force: input.force,
  }

  // Save-time projections of the three body_html*/body_text columns. Skipped when
  // the repo's no-op short-circuit will fire anyway: the pre-check mirrors
  // `isEquivalentToPublishedLatest` so an equivalent save never re-pays the jsdom
  // render. The repo re-checks under lock; a raced flip only leaves the columns
  // stale, which the nullable schema tolerates. Best-effort — the save must succeed.
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
    // The publish transaction rewrote the meta row — re-read it so
    // afterPublish sees post-publish state (mentions read `publishedAt`).
    const publishedMeta = adapter.findMetaById(db, input.entityId) ?? meta
    await adapter.afterPublish(db, publishedMeta, body, warnings)
    // A publish can schedule into the future — re-arm the timer (no-op until started).
    rescheduleScheduledPublish()
  }
  return { ...projectSaveResult(result), warningDescriptors: warnings }
}

/**
 * Draft preview by slug: latest draft, else the published revision; soft-deleted
 * rows and viewers refused by `canPreviewDraft` return `null`.
 */
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

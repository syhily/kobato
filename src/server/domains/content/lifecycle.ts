import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { ContentType, PublishLatestResult, SaveDraftResult } from '@/server/domains/content/schemas/revision'
import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'
import type { Database } from '@/server/infra/db/database'
import type { ContentRow } from '@/server/infra/db/types'
import type { AdminRevisionDto } from '@/shared/contracts/revision'
import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { PortableTextBody, PortableTextHeading } from '@/shared/pt/schema'
import type { RoleOrNull } from '@/shared/utils/roles'

import { toAdminRevisionDto } from '@/server/domains/content/projection'
import { publishLatestRevision, saveDraftRevision } from '@/server/domains/content/repos/mutate'
import { findContentById, findLatestDraft, findLatestRevision } from '@/server/domains/content/revisions'
import { rescheduleScheduledPublish } from '@/server/domains/content/scheduled-publish'
import { syncLibraryImageBlocks } from '@/server/domains/content/services/image-sync'
import { snapshotMusicPlayerMeta } from '@/server/domains/pt/lexical-music-snapshot'
import { canonicalizePortableTextBody } from '@/server/domains/pt/services/canonicalize'
import { canonicalizeLexicalEditorState } from '@/server/domains/pt/services/lexical-canonicalize'
import { getLogger, type Logger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug/derive'
import { collectLexicalHeadings, collectLexicalImageStoragePaths } from '@/shared/lexical/collect'
import { collectHeadings } from '@/shared/pt/utils'

const log = getLogger('content.lifecycle')

/**
 * Entity-agnostic draft→publish lifecycle for content revisions;
 * entity-specific behavior attaches through this adapter.
 */
export interface ContentEntityAdapter<TMeta, TPreview> {
  entityType: ContentType
  findMetaById(db: Database, id: number): TMeta | null
  findPublicMetaBySlug(db: Database, slug: string): TMeta | null
  assertAccess(meta: TMeta | null, viewer?: ViewerIdentity): asserts meta is TMeta
  /**
   * Draft-preview gate (posts author+, pages admin only). A predicate —
   * callers fall through to the published page when rights are missing.
   */
  canPreviewDraft(role: RoleOrNull | undefined): boolean
  getId(meta: TMeta): number
  getPublishedRevisionId(meta: TMeta): number | null
  projectPreview(meta: TMeta, revision: ContentRow | null): TPreview
  recordForceOverwrite(entry: ForceOverwriteEntry<TMeta>): void
  afterPublish(db: Database, meta: TMeta, body: LexicalEditorState, warnings: string[]): Promise<void>
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

/**
 * Shared `force_overwrite_save` audit payload; the logger scope and meta
 * id key stay with the caller so the emitted context keeps its shape.
 */
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
   * Music-domain resolver wired by the controller (the pt domain must not
   * depend on the music domain) — resolves `music-player` node playerIds
   * into the meta snapshot embedded at save time.
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
  /**
   * True when a `status='draft'` revision is newer than
   * `publishedRevisionId` — `preview` holds the draft when so.
   */
  hasNewerDraft: boolean
}

export async function saveBody<TMeta, TPreview>(
  db: Database,
  adapter: ContentEntityAdapter<TMeta, TPreview>,
  input: SaveBodyInput,
  mode: 'draft' | 'publish',
  viewer?: ViewerIdentity,
): Promise<SaveBodyResult> {
  const meta = adapter.findMetaById(db, input.entityId)
  adapter.assertAccess(meta, viewer)
  const body = await canonicalizeLexicalEditorState(input.body)
  await snapshotMusicPlayerMeta(body, input.resolveMusicEmbeds)

  const warnings: string[] = []

  try {
    await syncLibraryImageBlocks(db, body)
  } catch (err: unknown) {
    log.warn('sync library image blocks failed', {
      entityType: adapter.entityType,
      entityId: input.entityId,
      error: err,
    })
    warnings.push('图片库同步失败，部分图片可能无法正常显示。')
  }

  const imageSources = collectLexicalImageStoragePaths(body)
  const headings = collectLexicalHeadings(body)

  // Audit context = the latest revision of any status; a read ERROR here
  // propagates and aborts the save (audit P1-25) rather than drop the
  // overwrite's audit row.
  const overwriteContext =
    input.force === true ? await findLatestRevision(db, adapter.entityType, adapter.getId(meta)) : null

  const repoInput = {
    ownerId: adapter.getId(meta),
    body,
    imageSources,
    headings,
    authorId: input.authorId,
    expectedClientRevisionToken: input.expectedClientRevisionToken,
    force: input.force,
  }

  const result =
    mode === 'draft'
      ? await saveDraftRevision(db, adapter.entityType, repoInput)
      : await publishLatestRevision(db, adapter.entityType, { ...repoInput, publishedAt: input.publishedAt })

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
  return projectSaveResult(result, warnings.length > 0 ? warnings.join(' ') : undefined)
}

/**
 * Draft preview by slug: latest draft, else the published revision;
 * soft-deleted rows return `null`. No access gate — callers use
 * `adapter.canPreviewDraft`.
 */
export async function loadDraftPreviewBySlug<TMeta, TPreview>(
  db: Database,
  adapter: ContentEntityAdapter<TMeta, TPreview>,
  slug: string,
): Promise<DraftPreviewResult<TPreview> | null> {
  const meta = adapter.findPublicMetaBySlug(db, slug)
  if (meta === null) {
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

export async function previewBody(
  rawBody: unknown,
  render: (body: PortableTextBody) => Promise<string>,
): Promise<{ html: string; headings: PortableTextHeading[] }> {
  // Preview through the same canonicalize + prerender pipeline as save, so it matches what publishes.
  const body = await canonicalizePortableTextBody(rawBody)
  const html = await render(body)
  const headings = collectHeadings(body, deriveSlug)
  return { html, headings }
}

function projectSaveResult(result: SaveDraftResult | PublishLatestResult, warning?: string): SaveBodyResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
      warning,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row), warning }
}

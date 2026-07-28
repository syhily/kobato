import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { ContentType, PublishLatestResult, SaveDraftResult } from '@/server/domains/content/schemas/revision'
import type { Database } from '@/server/infra/db/database'
import type { ContentRow } from '@/server/infra/db/types'
import type { AdminRevisionDto } from '@/shared/contracts/revision'
import type { PortableTextBody, PortableTextHeading } from '@/shared/pt/schema'
import type { RoleOrNull } from '@/shared/utils/roles'

import { toAdminRevisionDto } from '@/server/domains/content/projection'
import { publishLatestRevision, saveDraftRevision } from '@/server/domains/content/repos/mutate'
import { findContentById, findLatestDraft, findLatestRevision } from '@/server/domains/content/revisions'
import { syncLibraryImageBlocks } from '@/server/domains/content/services/image-sync'
import { canonicalizePortableTextBody } from '@/server/domains/pt/services/canonicalize'
import { getLogger, type Logger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug/derive'
import { collectHeadings, collectImageStoragePaths } from '@/shared/pt/utils'

const log = getLogger('content.lifecycle')

/**
 * Entity-agnostic draft→publish lifecycle for content revisions. Posts
 * and pages share one pipeline; everything entity-specific attaches
 * through this adapter (meta lookup, access gate, preview access gate,
 * preview projection, force-overwrite audit, post-publish side effects).
 */
export interface ContentEntityAdapter<TMeta, TPreview> {
  entityType: ContentType
  findMetaById(db: Database, id: number): TMeta | null
  findPublicMetaBySlug(db: Database, slug: string): TMeta | null
  assertAccess(meta: TMeta | null, viewer?: ViewerIdentity): asserts meta is TMeta
  /**
   * Draft-preview gate (CONTEXT.md "Draft preview"): posts author+, pages
   * admin only. A predicate, not a throwing assert: the page loader must
   * fall through to the published page when the viewer lacks preview rights.
   */
  canPreviewDraft(role: RoleOrNull | undefined): boolean
  getId(meta: TMeta): number
  getPublishedRevisionId(meta: TMeta): number | null
  projectPreview(meta: TMeta, revision: ContentRow | null): TPreview
  recordForceOverwrite(entry: ForceOverwriteEntry<TMeta>): void
  afterPublish(db: Database, meta: TMeta, body: PortableTextBody, warnings: string[]): Promise<void>
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
 * Shared `force_overwrite_save` audit payload for the entity adapters'
 * `recordForceOverwrite`. The logger scope and meta id key stay with
 * the caller so the emitted context keeps its historical shape.
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
   * True when the entity has a `status='draft'` revision newer than its
   * `publishedRevisionId`. The body projected into `preview` is the
   * draft one when this is true.
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
  const body = await canonicalizePortableTextBody(input.body)

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

  const imageSources = collectImageStoragePaths(body)
  const headings = collectHeadings(body, deriveSlug)

  // The force-overwrite audit context is the latest revision of any
  // status — not just the latest draft — so publishing over a published
  // revision is audited the same way as overwriting a draft.
  const overwriteContext =
    input.force === true
      ? await findLatestRevision(db, adapter.entityType, adapter.getId(meta)).catch(() => null)
      : null

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
    await adapter.afterPublish(db, meta, body, warnings)
  }
  return projectSaveResult(result, warnings.length > 0 ? warnings.join(' ') : undefined)
}

/**
 * Draft preview by slug: projects the latest draft when one exists,
 * otherwise the published revision. Soft-deleted rows return `null`.
 * This module enforces no access rule — callers gate through
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
  // Route preview through the same canonicalize + prerender pipeline as
  // the save path so the preview matches what will actually be published
  // (Shiki/KaTeX artifacts included).
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

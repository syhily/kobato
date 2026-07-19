import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ViewerContext } from '@/server/domains/auth/rbac'
import type { PublishLatestResult, SaveDraftResult } from '@/server/domains/content/schema'
import type { ContentEntityType } from '@/server/domains/content/shared'
import type { ContentRow } from '@/server/infra/db/types'
import type { PortableTextBody, PortableTextHeading } from '@/shared/pt/schema'
import type { AdminRevisionDto } from '@/shared/types/revision'
import type { RoleOrNull } from '@/shared/utils/roles'

import { toAdminRevisionDto } from '@/server/domains/content/projection'
import { publishLatestRevision, saveDraftRevision } from '@/server/domains/content/repos/mutate'
import { findContentById, findLatestDraft, findLatestRevision } from '@/server/domains/content/repos/query'
import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { syncLibraryImageBlocks } from '@/server/domains/content/services/image-sync'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { collectHeadings, collectImageStoragePaths } from '@/shared/pt/utils'

const log = getLogger('content.lifecycle')

/**
 * Entity-agnostic draft→publish lifecycle for content revisions. Posts
 * and pages share one pipeline; everything entity-specific attaches
 * through this adapter (meta lookup, access gate, preview access gate,
 * preview projection, force-overwrite audit, post-publish side effects).
 */
export interface ContentEntityAdapter<TMeta, TPreview> {
  entityType: ContentEntityType
  findMetaById(db: NodePgDatabase, id: bigint): Promise<TMeta | null>
  findPublicMetaBySlug(db: NodePgDatabase, slug: string): Promise<TMeta | null>
  assertAccess(meta: TMeta | null, viewer?: ViewerContext): asserts meta is TMeta
  /**
   * Draft-preview gate — the per-entity preview access rule (CONTEXT.md
   * "Draft preview"): posts allow author and above; pages allow admin
   * only. Mounted by the public detail loaders before they call
   * `loadDraftPreviewBySlug`. A predicate, not a throwing assert: the
   * page loader must fall through to the published page when the viewer
   * lacks preview rights.
   */
  canPreviewDraft(role: RoleOrNull | undefined): boolean
  getId(meta: TMeta): bigint
  getPublishedRevisionId(meta: TMeta): bigint | null
  projectPreview(meta: TMeta, revision: ContentRow | null): TPreview
  recordForceOverwrite(entry: ForceOverwriteEntry<TMeta>): void
  afterPublish(db: NodePgDatabase, meta: TMeta, body: PortableTextBody, warnings: string[]): Promise<void>
}

export interface ForceOverwriteEntry<TMeta> {
  mode: 'draft' | 'publish'
  authorId: bigint | null
  meta: TMeta
  /** The latest revision the force save overwrote. */
  overwritten: ContentRow
  expectedClientRevisionToken?: string | null
  resultRow: ContentRow
}

export interface SaveBodyInput {
  entityId: bigint
  body: unknown
  expectedClientRevisionToken?: string | null
  force?: boolean
  authorId: bigint | null
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
  db: NodePgDatabase,
  adapter: ContentEntityAdapter<TMeta, TPreview>,
  input: SaveBodyInput,
  mode: 'draft' | 'publish',
  viewer?: ViewerContext,
): Promise<SaveBodyResult> {
  const meta = await adapter.findMetaById(db, input.entityId)
  adapter.assertAccess(meta, viewer)
  const body = await canonicalizeBodyOrThrow(input.body)

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
 * otherwise the published revision. Soft-deleted rows (filtered by
 * `findPublicMetaBySlug`) return `null`. This module enforces no access
 * rule — callers gate through `adapter.canPreviewDraft` (posts:
 * author+; pages: admin only; CONTEXT.md "Draft preview").
 */
export async function loadDraftPreviewBySlug<TMeta, TPreview>(
  db: NodePgDatabase,
  adapter: ContentEntityAdapter<TMeta, TPreview>,
  slug: string,
): Promise<DraftPreviewResult<TPreview> | null> {
  const meta = await adapter.findPublicMetaBySlug(db, slug)
  if (meta === null) {
    return null
  }
  const draft = await findLatestDraft(db, adapter.entityType, adapter.getId(meta))
  const publishedRevisionId = adapter.getPublishedRevisionId(meta)
  let revision: ContentRow | null = draft
  if (revision === null && publishedRevisionId !== null) {
    revision = await findContentById(db, publishedRevisionId)
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
  const body = await canonicalizeBodyOrThrow(rawBody)
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

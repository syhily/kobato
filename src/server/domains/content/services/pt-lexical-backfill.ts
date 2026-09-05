import { count, eq, sql } from 'drizzle-orm'

import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'
import type { CrossCheckResult } from '@/server/domains/pt/services/pt-lexical-crosscheck'
import type { Database } from '@/server/infra/db/database'
import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { snapshotMusicPlayerMeta } from '@/server/domains/pt/lexical-music-snapshot'
import {
  crossCheckArticleConversion,
  crossCheckCommentConversion,
  htmlRoundTripCrossCheck,
} from '@/server/domains/pt/services/pt-lexical-crosscheck'
import {
  convertCommentBody,
  convertPortableTextBody,
  mergePtConversionStats,
  UnmappedConstructError,
} from '@/server/domains/pt/services/pt-to-lexical'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { comment } from '@/server/infra/db/schema/comment'
import { content } from '@/server/infra/db/schema/content'
import { getLogger } from '@/server/infra/logger'
import { prerenderLexicalEditorState } from '@/server/infra/pt/lexical-prerender'
import {
  computeBodyProjections,
  computeBodyText,
  computeCommentContentProjection,
  renderLexicalFragmentHtml,
} from '@/server/infra/pt/lexical-projection'
import { collectLexicalHeadings, collectLexicalImageStoragePaths } from '@/shared/lexical/collect'
import { commentEditorStateSchema } from '@/shared/lexical/comment-schema'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { visitLexicalNodes } from '@/shared/lexical/walk'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { safeValidatePortableTextBody } from '@/shared/pt/utils'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The R15 PT→Lexical data backfill (plan docs/plans/inkling-editor-replacement.md,
// round R15 / M2d): row-by-row bespoke conversion of every legacy PortableText
// `content` revision and `comment` row to the canonical Lexical state, with
// the per-row zero-loss cross-check (E1–E4) as the write gate and the HTML
// round-trip (E5) as a non-failing audit warning.
//
// Row write semantics (apply mode):
//   content — `body` (converted state), derived `imageSources`/`headings`
//     (recollected from the converted state), and the three R9b projection
//     columns `bodyHtml`/`bodyText`/`bodyHtmlFeed`. `updatedAt` and
//     `clientRevisionToken` are deliberately NOT touched (the backfill is not
//     an edit; optimistic-concurrency tokens survive).
//   comment — `body` (converted restricted state), `content` (the R12
//     feed-variant degraded-HTML snapshot, plain-text fallback like the save
//     pipeline), `contentHash` (re-hashed from the new snapshot through the
//     injected comments-domain hasher — content must not import comments, so
//     the composition root wires `hashContent`).
//   The image library is NOT re-synced (`syncLibraryImageBlocks` rewrites
//   library note/src fields — a mutation beyond zero-loss; registered
//   deviation).
//
// Idempotency: converted rows parse as Lexical states and are skipped on
// re-run, so a second apply converts zero rows. The durable one-shot flag is
// the `system.pt-lexical-backfill` setting row (the
// `system.asset-url-backfill` pattern), written ONLY when an apply pass
// finishes with zero failures — a failed run retries whole-corpus on the
// next invocation and reconverts nothing.
//
// Cross-domain cycle guard: `comments → content` and `posts → content` edges
// exist, so this module may import neither. The comment hasher and the
// search-index rebuild arrive as injected collaborators (the repo's
// documented composition-root pattern); the boot wrapper and the CLI script
// wire the real ones.

const log = getLogger('content.pt-lexical-backfill')

/** Durable one-shot flag: a `system.`-scoped `setting` row (hydration reads `blog.*` only). */
const BOOT_FLAG_SCOPE = 'system.pt-lexical-backfill'

/**
 * Boot behaviour while R15a is under audit: count and warn only. R15b flips
 * this to 'apply' after the dry-run report is signed off and the database
 * backup is confirmed (「升级即转换」).
 */
const BOOT_MODE: PtLexicalBackfillMode = 'dry-run'

export type PtLexicalBackfillMode = 'dry-run' | 'apply'

export interface SearchReindexSummary {
  processed: number
  failed: number
  total: number
}

export interface PtLexicalBackfillOptions {
  mode: PtLexicalBackfillMode
  resolveMusicEmbeds: MusicEmbedResolver
  /** The comments domain's `contentHash` hasher (sha256 hex of the snapshot). */
  hashCommentContent: (content: string) => string
  /** Apply mode only: rebuild `post_search_index` after the row pass. */
  reindexSearchIndex?: () => Promise<SearchReindexSummary>
}

export interface PtLexicalBackfillFailure {
  table: 'content' | 'comment'
  id: number
  /** content rows: `type/ownerId/revisionNo` for the audit trail. */
  context?: string
  errors: string[]
}

export interface PtLexicalBackfillTableReport {
  totalRows: number
  /** Rows still holding a PortableText body. */
  legacyRows: number
  /** Rows already on the Lexical format (skipped; idempotent re-run). */
  alreadyLexical: number
  /** Legacy rows that converted AND passed the cross-check gate. */
  converted: number
  /** Apply-mode writes performed (dry-run: always 0). */
  written: number
  failed: number
  failures: PtLexicalBackfillFailure[]
  /** Entries dropped past the failures-list cap. */
  failuresTruncated: number
}

export interface PtLexicalBackfillReport {
  mode: PtLexicalBackfillMode
  startedAt: string
  durationMs: number
  /** Conversion-construct coverage, merged across both tables. */
  stats: {
    blockTypes: Record<string, number>
    markDefTypes: Record<string, number>
    decoratorMarks: Record<string, number>
    nestedBlockTypes: Record<string, Record<string, number>>
    musicFlagDrops: number
    orphanFootnoteRefs: number
  }
  content: PtLexicalBackfillTableReport
  comments: PtLexicalBackfillTableReport
  music: {
    players: number
    resolved: number
    metaLess: number
    metaLessPlayerIds: string[]
  }
  crossCheck: {
    slugPolicyChanges: number
    nestedImageStoragePaths: string[]
    nestedHeadings: number
    /** E5 round-trip warnings (non-failing by definition). */
    e5Warnings: number
    e5WarningSamples: string[]
  }
  searchIndex: SearchReindexSummary | null
  /** Apply mode wrote the one-shot flag (zero failures). */
  flagWritten: boolean
}

const MAX_FAILURES_PER_TABLE = 500
const MAX_E5_WARNING_SAMPLES = 100

function emptyTableReport(): PtLexicalBackfillTableReport {
  return {
    totalRows: 0,
    legacyRows: 0,
    alreadyLexical: 0,
    converted: 0,
    written: 0,
    failed: 0,
    failures: [],
    failuresTruncated: 0,
  }
}

function recordFailure(report: PtLexicalBackfillTableReport, failure: PtLexicalBackfillFailure): void {
  report.failed += 1
  if (report.failures.length < MAX_FAILURES_PER_TABLE) {
    report.failures.push(failure)
  } else {
    report.failuresTruncated += 1
  }
}

function errorMessages(error: unknown): string[] {
  if (error instanceof UnmappedConstructError) {
    return [...error.constructs]
  }
  return [error instanceof Error ? error.message : String(error)]
}

/**
 * The card-dataset HTML renderer injected into the converter: wrap the
 * fragment as a root state, fill the KaTeX/Shiki artifact slots FIRST (the
 * projection renders math/code from those slots), then run the same
 * projection pipeline the body columns use.
 */
async function renderFragmentPrerendered(children: LexicalNodeJson[]): Promise<string> {
  const fragmentState = unsafeCast<LexicalEditorState>({
    root: { type: 'root', version: 1, children, direction: 'ltr', format: '', indent: 0 },
  })
  await prerenderLexicalEditorState(fragmentState)
  return renderLexicalFragmentHtml(fragmentState.root.children)
}

interface MusicAccounting {
  players: number
  resolved: number
  metaLessPlayerIds: Set<string>
}

function accountMusicMeta(state: LexicalEditorState, music: MusicAccounting): void {
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'music-player') {
      return
    }
    const record = unsafeCast<Record<string, unknown>>(node)
    music.players += 1
    if (typeof record.name === 'string' && record.name !== '') {
      music.resolved += 1
      return
    }
    if (typeof record.playerId === 'string' && record.playerId !== '') {
      music.metaLessPlayerIds.add(record.playerId)
    }
  })
}

function accumulateCrossCheck(report: PtLexicalBackfillReport, check: CrossCheckResult): void {
  report.crossCheck.slugPolicyChanges += check.slugPolicyChanges
  report.crossCheck.nestedHeadings += check.nestedHeadings
  for (const path of check.nestedImageStoragePaths) {
    if (!report.crossCheck.nestedImageStoragePaths.includes(path)) {
      report.crossCheck.nestedImageStoragePaths.push(path)
    }
  }
}

async function backfillContentRows(
  db: Database,
  options: PtLexicalBackfillOptions,
  report: PtLexicalBackfillReport,
  music: MusicAccounting,
): Promise<void> {
  const table = report.content
  const rows = await db
    .select({
      id: content.id,
      type: content.type,
      ownerId: content.ownerId,
      revisionNo: content.revisionNo,
      body: content.body,
      headings: content.headings,
    })
    .from(content)
  table.totalRows = rows.length

  for (const row of rows) {
    const context = `${row.type}/${row.ownerId}/r${row.revisionNo}`
    const ptParsed = safeValidatePortableTextBody(row.body)
    if (!ptParsed.ok) {
      if (lexicalEditorStateSchema.safeParse(row.body).success) {
        table.alreadyLexical += 1
      } else {
        recordFailure(table, {
          table: 'content',
          id: row.id,
          context,
          errors: ['body parses as neither PortableText nor Lexical'],
        })
      }
      continue
    }
    table.legacyRows += 1
    try {
      const { state, stats, fragments } = await convertPortableTextBody(ptParsed.body, {
        renderFragmentHtml: renderFragmentPrerendered,
      })
      mergePtConversionStats(report.stats, stats)

      // Save-pipeline parity (R9a): the meta snapshot rides the injected
      // resolver, THEN the artifact prerender fills the top-level slots.
      await snapshotMusicPlayerMeta(state, options.resolveMusicEmbeds)
      accountMusicMeta(state, music)
      await prerenderLexicalEditorState(state)
      lexicalEditorStateSchema.parse(state)

      const projections = await computeBodyProjections(state)
      const check = crossCheckArticleConversion({
        ptBody: ptParsed.body,
        converted: state,
        nestedFragments: fragments,
        storedHeadings: row.headings,
      })
      accumulateCrossCheck(report, check)

      // E5: round-trip stability of the state's own HTML projection. Never
      // fails the row — the stored data is the direct conversion; even a
      // throwing importer (unimportable markup) degrades to a warning.
      let warnings: string[]
      try {
        warnings = await htmlRoundTripCrossCheck(state, projections.bodyHtml)
      } catch (error) {
        warnings = [`round-trip threw: ${error instanceof Error ? error.message : String(error)}`]
      }
      report.crossCheck.e5Warnings += warnings.length
      for (const warning of warnings) {
        if (report.crossCheck.e5WarningSamples.length < MAX_E5_WARNING_SAMPLES) {
          report.crossCheck.e5WarningSamples.push(`content ${row.id} (${context}): ${warning}`)
        }
      }

      if (!check.ok) {
        recordFailure(table, { table: 'content', id: row.id, context, errors: check.failures })
        continue
      }
      table.converted += 1

      if (options.mode === 'apply') {
        await db
          .update(content)
          .set({
            body: state,
            imageSources: collectLexicalImageStoragePaths(state),
            headings: collectLexicalHeadings(state),
            bodyHtml: projections.bodyHtml,
            bodyText: projections.bodyText,
            bodyHtmlFeed: projections.bodyHtmlFeed,
          })
          .where(eq(content.id, row.id))
        table.written += 1
      }
    } catch (error) {
      recordFailure(table, { table: 'content', id: row.id, context, errors: errorMessages(error) })
    }
  }
}

async function backfillCommentRows(
  db: Database,
  options: PtLexicalBackfillOptions,
  report: PtLexicalBackfillReport,
): Promise<void> {
  const table = report.comments
  const rows = await db.select({ id: comment.id, body: comment.body }).from(comment)
  table.totalRows = rows.length

  for (const row of rows) {
    const ptParsed = commentBodySchema.safeParse(row.body)
    if (!ptParsed.success) {
      if (commentEditorStateSchema.safeParse(row.body).success) {
        table.alreadyLexical += 1
      } else {
        recordFailure(table, {
          table: 'comment',
          id: row.id,
          errors: ['body parses as neither PortableText nor Lexical'],
        })
      }
      continue
    }
    table.legacyRows += 1
    try {
      const { state, stats } = convertCommentBody(ptParsed.data)
      mergePtConversionStats(report.stats, stats)
      await prerenderLexicalEditorState(state)
      commentEditorStateSchema.parse(state)

      // Save-pipeline parity (R12): the degraded-HTML snapshot, plain-text
      // fallback on render failure (the comment node set is stock inkling, so
      // the corpus-only helper matches the save pipeline's fallback).
      let contentSnapshot: string
      try {
        contentSnapshot = await computeCommentContentProjection(unsafeCast<LexicalEditorState>(state))
      } catch {
        contentSnapshot = computeBodyText(unsafeCast<LexicalEditorState>(state))
      }

      const check = crossCheckCommentConversion(ptParsed.data, unsafeCast<LexicalEditorState>(state))
      if (!check.ok) {
        recordFailure(table, { table: 'comment', id: row.id, errors: check.failures })
        continue
      }
      table.converted += 1

      if (options.mode === 'apply') {
        await db
          .update(comment)
          .set({
            body: state,
            content: contentSnapshot,
            contentHash: options.hashCommentContent(contentSnapshot),
          })
          .where(eq(comment.id, row.id))
        table.written += 1
      }
    } catch (error) {
      recordFailure(table, { table: 'comment', id: row.id, errors: errorMessages(error) })
    }
  }
}

/**
 * The corpus pass. Dry-run performs ZERO writes (the CLI additionally opens
 * the database read-only for an OS-level guarantee). Apply mode writes the
 * one-shot flag only when both tables finish with zero failures.
 */
export async function runPtLexicalBackfill(
  db: Database,
  options: PtLexicalBackfillOptions,
): Promise<PtLexicalBackfillReport> {
  const startedAt = new Date()
  const report: PtLexicalBackfillReport = {
    mode: options.mode,
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    stats: {
      blockTypes: {},
      markDefTypes: {},
      decoratorMarks: {},
      nestedBlockTypes: {},
      musicFlagDrops: 0,
      orphanFootnoteRefs: 0,
    },
    content: emptyTableReport(),
    comments: emptyTableReport(),
    music: { players: 0, resolved: 0, metaLess: 0, metaLessPlayerIds: [] },
    crossCheck: {
      slugPolicyChanges: 0,
      nestedImageStoragePaths: [],
      nestedHeadings: 0,
      e5Warnings: 0,
      e5WarningSamples: [],
    },
    searchIndex: null,
    flagWritten: false,
  }

  const music: MusicAccounting = { players: 0, resolved: 0, metaLessPlayerIds: new Set<string>() }
  await backfillContentRows(db, options, report, music)
  await backfillCommentRows(db, options, report)
  report.music = {
    players: music.players,
    resolved: music.resolved,
    metaLess: music.metaLessPlayerIds.size,
    metaLessPlayerIds: [...music.metaLessPlayerIds].sort(),
  }

  if (options.mode === 'apply') {
    if (options.reindexSearchIndex !== undefined) {
      report.searchIndex = await options.reindexSearchIndex()
    }
    if (report.content.failed === 0 && report.comments.failed === 0) {
      upsertSetting(
        db,
        {
          completedAt: new Date().toISOString(),
          content: { converted: report.content.converted, alreadyLexical: report.content.alreadyLexical },
          comments: { converted: report.comments.converted, alreadyLexical: report.comments.alreadyLexical },
          searchIndex: report.searchIndex,
        },
        null,
        BOOT_FLAG_SCOPE,
      )
      report.flagWritten = true
    }
  }

  report.durationMs = Date.now() - startedAt.getTime()
  return report
}

/** Cheap legacy-row COUNT for the boot gate (no jsdom, no conversion). */
export function countLegacyPtRows(db: Database): { content: number; comments: number } {
  const contentRows = db
    .select({ n: count() })
    .from(content)
    .where(sql`substr(${content.body}, 1, 1) = '['`)
    .all()
  const commentRows = db
    .select({ n: count() })
    .from(comment)
    .where(sql`substr(${comment.body}, 1, 1) = '['`)
    .all()
  return { content: contentRows[0]?.n ?? 0, comments: commentRows[0]?.n ?? 0 }
}

export interface PtLexicalBackfillCollaborators {
  resolveMusicEmbeds: MusicEmbedResolver
  hashCommentContent: (content: string) => string
  reindexSearchIndex: () => Promise<SearchReindexSummary>
}

/**
 * Flag-gated boot entry point (the `runAssetUrlBackfillOnceAtBoot` pattern):
 * failure-swallowing, fire-and-forget. While BOOT_MODE is 'dry-run' it only
 * counts and warns — the audited conversion runs through
 * `scripts/pt-lexical-backfill.ts --apply` (R15b flips the constant).
 */
export async function runPtLexicalBackfillAtBoot(
  db: Database,
  collaborators: PtLexicalBackfillCollaborators,
): Promise<void> {
  try {
    if (findSettingByScope(db, BOOT_FLAG_SCOPE) !== null) {
      return
    }
    const pending = countLegacyPtRows(db)
    if (pending.content === 0 && pending.comments === 0) {
      // Fresh install (or a corpus that never held PT) — nothing to convert.
      upsertSetting(
        db,
        { completedAt: new Date().toISOString(), note: 'no legacy PortableText rows' },
        null,
        BOOT_FLAG_SCOPE,
      )
      return
    }
    if (BOOT_MODE === 'dry-run') {
      log.warn('Legacy PortableText bodies pending the PT→Lexical backfill', {
        ...pending,
        command: 'pnpm vite-node scripts/pt-lexical-backfill.ts --apply',
      })
      return
    }
    const report = await runPtLexicalBackfill(db, { mode: BOOT_MODE, ...collaborators })
    if (report.flagWritten) {
      log.info('PT→Lexical backfill completed', {
        content: report.content.converted,
        comments: report.comments.converted,
        searchIndex: report.searchIndex,
      })
    } else {
      log.warn('PT→Lexical backfill finished with failures; flag withheld, retrying next boot', {
        contentFailed: report.content.failed,
        commentsFailed: report.comments.failed,
      })
    }
  } catch (error) {
    log.warn('PT→Lexical boot backfill failed; will retry on next boot', { error: String(error) })
  }
}

import type { PtMigrationRowKind, PtRowStatus } from '@kobato/server/infra/pt-migration/core'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { processPtRow, spotRender, truncateError } from '@kobato/server/infra/pt-migration/core'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'
import { isSafeUrl } from '@kobato/shared/sanitize-url'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Built-in PortableText → Lexical data migration (`kobato migrate-pt`),
// the server-side replacement for the retired
// `scripts/migrate-pt-to-lexical.ts`. Reads every `content.body` and
// `comment.body` row from a SQLite database, converts PT-shaped bodies
// (JSON arrays) through the legacy pipeline to the canonical Lexical
// dialect, and writes them back.
//
// Safety model (identical to the retired script):
//   - `backupPath` is REQUIRED for any write: the source SQLite file is
//     copied verbatim before the first statement runs.
//   - Idempotent: already-Lexical rows are skipped, so a re-run (or a
//     crash-and-retry) only touches the PT rows that are still there.
//   - `check` never writes: it runs the same per-row pipeline and
//     reports what would happen.
//   - Every row lands in `reportPath` as JSONL (one JSON object per
//     line): `{kind, id, status, beforeBytes, afterBytes?, error?}` with
//     status `migrated` | `skipped-lexical` | `error` — plus
//     `verify-failed` rows appended when `verify` finds a gate or sanity
//     violation.
//
// `verify` (write mode only) re-reads every migrated/skipped row after
// the commit: the read-path gate (`parseLexicalBody` /
// `parseLexicalCommentBody`), a spot-render of the first three content
// rows, and the sanity assertions in `verifyBodySanity` — footnoteRef
// targets must exist among the body's footnoteDefinitions, containers
// may only nest two deep (content), comment lists at most four deep,
// and every link url must pass `isSafeUrl`. Violations are recorded in
// the report (status `verify-failed`) and the summary; they never
// throw.
//
// The config graph (`@kobato/server/infra/config`) is imported
// DYNAMICALLY and only when `dbPath` is omitted — the CLI static import
// budget is untouched (same pattern as `--doctor-config-probe`).

export interface PtMigrationOptions {
  /** SQLite database file. Omitted → resolved from `serverConfig.storage.database` (empty → `<storage.data>/kobato.db`). */
  dbPath?: string
  /** Copy the database here before any write (required unless `check`). */
  backupPath?: string
  /** Audit mode: run the pipeline read-only, never write. */
  check?: boolean
  /** After migrating, re-read every row, gate it, spot-render, and run the sanity assertions. */
  verify?: boolean
  /** JSONL report path (default: `./migration-report.jsonl`). */
  reportPath?: string
}

export interface PtMigrationError {
  kind: PtMigrationRowKind
  id: number
  error: string
}

export interface PtMigrationSummary {
  /** The database file the migration ran over (resolved, including the config-derived default). */
  dbPath: string
  /** Rows examined (content + comment). */
  checked: number
  migrated: number
  skipped: number
  failed: number
  /** Rows that failed the post-migration gate or sanity assertions (`verify` mode). */
  verifyFailed: number
  /** Rows re-read during `verify` (migrated + skipped, minus migration errors). */
  verifyChecked: number
  /** Content rows spot-rendered during `verify` (capped at 3). */
  spotRendered: number
  /** Stored bytes of the migrated rows before conversion. */
  bytesBefore: number
  /** Stored bytes of the migrated rows after conversion. */
  bytesAfter: number
  errors: PtMigrationError[]
  verifyErrors: PtMigrationError[]
  reportPath: string
  backupPath?: string
}

/** A JSONL report entry — the stable machine-readable contract. */
export interface PtMigrationReportRow {
  kind: PtMigrationRowKind
  id: number
  status: PtRowStatus | 'verify-failed'
  beforeBytes: number
  afterBytes?: number
  error?: string
}

/** Usage-level failures (missing `--backup`, database file not found) — the CLI maps these to exit code 2. */
export class PtMigrationUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PtMigrationUsageError'
  }
}

/**
 * The effective database file path: `storage.database` when set,
 * otherwise `<storage.data>/kobato.db` (mirrors
 * `infra/db/database.ts::resolveDatabasePath`). The config graph is
 * imported DYNAMICALLY — this module must stay importable without it
 * (the CLI's static-import budget).
 */
export async function resolvePtMigrationDbPath(explicit: string | undefined): Promise<string> {
  if (explicit !== undefined && explicit !== '') {
    return explicit
  }
  const { serverConfig } = await import('@kobato/server/infra/config')
  const configured = serverConfig.storage.database
  if (configured === ':memory:') {
    return configured
  }
  return path.resolve(configured === '' ? path.join(serverConfig.storage.data, 'kobato.db') : configured)
}

// --- verify sanity assertions -------------------------------------------------

const CONTAINER_TYPES = new Set(['solution', 'twoColumn', 'footnoteDefinition'])
/** Comment list nesting cap — mirrors the comment schema's level-4 bound. */
const COMMENT_LIST_MAX_DEPTH = 4
/** Content container nesting cap — root (1) → container (2); containers inside containers violate the schema. */
const CONTENT_CONTAINER_MAX_DEPTH = 2

function isNodeObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return 'type' in value && typeof value.type === 'string'
}

interface WalkedNode {
  node: Record<string, unknown>
  /** Tree depth with the root node at 1. */
  depth: number
  /** Level of the list this node belongs to (0 = not inside a list; a list node reports its own level). */
  listLevel: number
}

/** Generic pre-order walk over every node of a parsed Lexical body (blocks, inlines, nested children). */
function walkBodyNodes(body: LexicalBody | LexicalCommentBody, visit: (entry: WalkedNode) => void): void {
  const walk = (node: Record<string, unknown>, depth: number, listLevel: number): void => {
    const nodeListLevel = node.type === 'list' ? listLevel + 1 : listLevel
    visit({ node, depth, listLevel: nodeListLevel })
    const children = node.children
    if (!Array.isArray(children)) {
      return
    }
    for (const child of children) {
      if (isNodeObject(child)) {
        walk(child, depth + 1, nodeListLevel)
      }
    }
  }
  const root = unsafeCast<Record<string, unknown>>(body.root)
  walk(root, 1, 0)
}

/**
 * Machine-checkable sanity assertions over a CONVERTED (gated) Lexical
 * body — the migration guarantees beyond the read-path gate:
 *
 *   - every `footnoteRef.targetKey` exists among the body's
 *     `footnoteDefinition` keys (definitions sit at the body end after
 *     canonicalization)
 *   - containers (`solution` / `twoColumn` / `footnoteDefinition`) nest
 *     at most `CONTENT_CONTAINER_MAX_DEPTH` deep (content; the schema
 *     allows them at the root only)
 *   - comment lists nest at most `COMMENT_LIST_MAX_DEPTH` deep
 *   - every `link.url` passes `isSafeUrl`
 *
 * Returns the list of violation messages (empty = healthy). Never
 * throws.
 */
export function verifyBodySanity(body: LexicalBody | LexicalCommentBody, kind: PtMigrationRowKind): string[] {
  const failures: string[] = []
  const definitionKeys = new Set<string>()
  const refs: string[] = []
  const links: string[] = []
  let maxListLevel = 0
  walkBodyNodes(body, ({ node, depth, listLevel }) => {
    if (node.type === 'footnoteDefinition') {
      const key = node.ptKey
      if (typeof key === 'string' && key !== '') {
        definitionKeys.add(key)
      }
      return
    }
    if (node.type === 'footnoteRef') {
      refs.push(typeof node.targetKey === 'string' ? node.targetKey : '')
      return
    }
    if (node.type === 'link') {
      links.push(typeof node.url === 'string' ? node.url : '')
      return
    }
    if (node.type === 'list') {
      maxListLevel = Math.max(maxListLevel, listLevel)
      return
    }
    if (kind === 'content' && depth > CONTENT_CONTAINER_MAX_DEPTH) {
      const type = typeof node.type === 'string' ? node.type : ''
      if (CONTAINER_TYPES.has(type)) {
        failures.push(
          `container node "${type}" at depth ${depth} exceeds the content cap of ${CONTENT_CONTAINER_MAX_DEPTH}`,
        )
      }
    }
  })
  if (kind === 'comment' && maxListLevel > COMMENT_LIST_MAX_DEPTH) {
    failures.push(`list nesting depth ${maxListLevel} exceeds the comment cap of ${COMMENT_LIST_MAX_DEPTH}`)
  }
  for (const targetKey of refs) {
    if (targetKey === '' || !definitionKeys.has(targetKey)) {
      failures.push(`footnoteRef targetKey "${targetKey}" has no footnoteDefinition in the body`)
    }
  }
  for (const url of links) {
    if (!isSafeUrl(url)) {
      failures.push(`link url "${url}" failed isSafeUrl`)
    }
  }
  return failures
}

// --- migration driver ----------------------------------------------------------

/**
 * Run the one-way PT → Lexical migration over a SQLite database. The
 * whole write (both tables) lands in a single transaction; the backup
 * copy happens before the first statement. Resolves to the migration
 * summary; throws `PtMigrationUsageError` for usage-level problems.
 */
export async function runPtToLexicalMigration(options: PtMigrationOptions = {}): Promise<PtMigrationSummary> {
  const dbPath = await resolvePtMigrationDbPath(options.dbPath)
  if (!existsSync(dbPath)) {
    throw new PtMigrationUsageError(`database not found: ${dbPath}`)
  }
  const checkOnly = options.check === true
  const backupPath = options.backupPath
  if (!checkOnly) {
    if (backupPath === undefined || backupPath === '') {
      throw new PtMigrationUsageError('--backup <path> is required unless --check is given')
    }
    copyFileSync(dbPath, backupPath)
  }
  const reportPath = options.reportPath ?? 'migration-report.jsonl'

  const report: PtMigrationReportRow[] = []
  const errors: PtMigrationError[] = []
  let checked = 0
  let migrated = 0
  let skipped = 0
  let failed = 0
  let bytesBefore = 0
  let bytesAfter = 0

  const db = new DatabaseSync(dbPath)
  const processTable = (kind: PtMigrationRowKind): void => {
    const select = db.prepare(`SELECT id, body FROM ${kind}`)
    const update = db.prepare(`UPDATE ${kind} SET body = ? WHERE id = ?`)
    const rows = select.all().map((row) => ({ id: Number(row.id), body: String(row.body) }))
    for (const row of rows) {
      checked += 1
      const outcome = processPtRow(kind, row.id, row.body)
      const entry: PtMigrationReportRow = {
        kind,
        id: row.id,
        status: outcome.status,
        beforeBytes: outcome.beforeBytes,
        ...(outcome.status === 'migrated' ? { afterBytes: outcome.afterBytes } : {}),
        ...(outcome.status === 'error' ? { error: outcome.error } : {}),
      }
      report.push(entry)
      if (outcome.status === 'migrated') {
        if (!checkOnly) {
          update.run(outcome.converted, row.id)
        }
        migrated += 1
        bytesBefore += outcome.beforeBytes
        bytesAfter += outcome.afterBytes
      } else if (outcome.status === 'skipped-lexical') {
        skipped += 1
      } else {
        failed += 1
        errors.push({ kind, id: row.id, error: outcome.error })
      }
    }
  }

  if (!checkOnly) {
    db.exec('BEGIN')
  }
  try {
    processTable('content')
    processTable('comment')
  } finally {
    if (!checkOnly) {
      db.exec('COMMIT')
    }
  }
  db.close()

  let verifyFailed = 0
  let verifyChecked = 0
  let spotRendered = 0
  const verifyErrors: PtMigrationError[] = []
  if (options.verify === true && !checkOnly) {
    ;({ verifyChecked, spotRendered } = verifyDatabase(dbPath, report, verifyErrors))
    verifyFailed = verifyErrors.length
  }

  writeFileSync(reportPath, report.map((entry) => JSON.stringify(entry)).join('\n') + '\n')

  return {
    dbPath,
    checked,
    migrated,
    skipped,
    failed,
    verifyFailed,
    verifyChecked,
    spotRendered,
    bytesBefore,
    bytesAfter,
    errors,
    verifyErrors,
    reportPath,
    backupPath: checkOnly ? undefined : backupPath,
  }
}

/**
 * Re-read every row after migration: gate each body, spot-render a few
 * content rows, and run the sanity assertions. Rows that failed
 * migration (still PT) are skipped — they are reported in the JSONL
 * with their error; the invariant verified here is "every
 * migrated/skipped row parses, survives SSR, and satisfies the sanity
 * assertions". Violations are pushed into `report` (status
 * `verify-failed`) and `verifyErrors`; never throws.
 */
function verifyDatabase(
  dbPath: string,
  report: PtMigrationReportRow[],
  verifyErrors: PtMigrationError[],
): { verifyChecked: number; spotRendered: number } {
  const skippedKeys = new Set(
    report.filter((entry) => entry.status === 'error').map((entry) => `${entry.kind}:${entry.id}`),
  )
  const db = new DatabaseSync(dbPath)
  let verifyChecked = 0
  let spotRendered = 0

  const recordFailure = (kind: PtMigrationRowKind, id: number, storedBody: string, error: string): void => {
    report.push({
      kind,
      id,
      status: 'verify-failed',
      beforeBytes: Buffer.byteLength(storedBody),
      error,
    })
    verifyErrors.push({ kind, id, error })
  }

  const checkTable = (kind: PtMigrationRowKind): void => {
    const rows = db
      .prepare(`SELECT id, body FROM ${kind}`)
      .all()
      .map((row) => ({ id: Number(row.id), body: String(row.body) }))
    for (const row of rows) {
      if (skippedKeys.has(`${kind}:${row.id}`)) {
        continue
      }
      verifyChecked += 1
      let parsed: unknown
      try {
        parsed = JSON.parse(row.body)
      } catch {
        recordFailure(kind, row.id, row.body, 'verify: not valid JSON')
        continue
      }
      try {
        let body: LexicalBody | LexicalCommentBody
        if (kind === 'comment') {
          body = parseLexicalCommentBody(parsed)
        } else {
          body = parseLexicalBody(parsed)
          if (spotRendered < 3) {
            spotRender(body)
            spotRendered += 1
          }
        }
        for (const message of verifyBodySanity(body, kind)) {
          recordFailure(kind, row.id, row.body, `verify: ${message}`)
        }
      } catch (error) {
        recordFailure(kind, row.id, row.body, `verify: failed gate: ${truncateError(error)}`)
      }
    }
  }

  checkTable('content')
  checkTable('comment')
  db.close()
  return { verifyChecked, spotRendered }
}

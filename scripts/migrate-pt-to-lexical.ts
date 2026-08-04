#!/usr/bin/env node
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { canonicalizeLexicalBodyShape } from '@kobato/editor/lexical-core/canonicalize'
import { canonicalizeLexicalCommentBodyShape } from '@kobato/editor/lexical-core/comment-canonicalize'
import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { lexicalBodyToHtml } from '@kobato/editor/lexical-html/lexicalBodyToHtml'
import { canonicalizePortableTextBodyShape } from '@kobato/shared/legacy-pt/canonicalize'
import { commentBodySchema } from '@kobato/shared/legacy-pt/comment-schema'
import { safeValidatePortableTextBody } from '@kobato/shared/legacy-pt/utils'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'
//
// One-way PortableText → Lexical body migration (stage 4, R6).
//
// Reads every `content.body` and `comment.body` row from a SQLite
// database, converts PT-shaped bodies (JSON arrays) through the legacy
// pipeline to the canonical Lexical dialect, and writes them back.
//
//   pnpm exec vite-node scripts/migrate-pt-to-lexical.ts --db <path> --backup <path>
//   pnpm exec vite-node scripts/migrate-pt-to-lexical.ts --db <path> --check        # audit only
//   pnpm exec vite-node scripts/migrate-pt-to-lexical.ts --db <path> --backup <path> --verify
//
// Safety model:
//   - `--backup <path>` is REQUIRED for any write: the source SQLite file
//     is copied verbatim before the first statement runs.
//   - Idempotent: already-Lexical rows are skipped, so a re-run (or a
//     crash-and-retry) only touches the PT rows that are still there.
//   - `--check` never writes: it runs the same per-row pipeline and
//     reports what would happen.
//   - Every row lands in `migration-report.jsonl` (one JSON object per
//     line): `{kind, id, status, beforeBytes, afterBytes, error?}` with
//     status `migrated` | `skipped-lexical` | `error`.
//
// Per-row pipeline: JSON.parse → PT-shape gate (`Array.isArray` + first
// element carries `_type`) → safeValidate (`portableTextBodySchema` for
// content, `commentBodySchema` for comments) →
// `canonicalizePortableTextBodyShape` → `convertPtBodyToLexical` →
// `canonicalizeLexicalBodyShape` (content) /
// `canonicalizeLexicalCommentBodyShape` (comments, mirroring the server's
// comment write path) → read-path gate (`parseLexicalBody` /
// `parseLexicalCommentBody`) → write back.
//
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const USAGE = `usage: migrate-pt-to-lexical.ts --db <sqlite> (--backup <path> | --check) [--report <path>] [--verify]

  --db <path>      SQLite database file (required)
  --backup <path>  copy the database here before any write (required unless --check)
  --check          audit mode: run the pipeline read-only, never write
  --verify         after migrating, re-read every row, gate it, and spot-render
  --report <path>  JSONL report path (default: ./migration-report.jsonl)`

interface RowResult {
  kind: 'content' | 'comment'
  id: number
  status: 'migrated' | 'skipped-lexical' | 'error'
  beforeBytes: number
  afterBytes?: number
  error?: string
}

function parseArgs(argv: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    if (!arg.startsWith('--')) {
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      flags[arg] = 'true'
    } else {
      flags[arg] = value
      i += 1
    }
  }
  return flags
}

/** True when the value looks like a stored PortableText body: a JSON array whose first element carries `_type`. */
function isPortableTextShape(parsed: unknown): parsed is unknown[] {
  if (!Array.isArray(parsed)) {
    return false
  }
  const first = parsed[0]
  return parsed.length === 0 || (typeof first === 'object' && first !== null && '_type' in first)
}

/** Run the one-way conversion pipeline. Returns the canonical Lexical body or throws. */
function convertRow(parsed: unknown, kind: 'content' | 'comment'): LexicalBody | LexicalCommentBody {
  if (kind === 'comment') {
    const pt = commentBodySchema.parse(parsed)
    return canonicalizeLexicalCommentBodyShape(convertPtBodyToLexical(canonicalizePortableTextBodyShape(pt)))
  }
  const result = safeValidatePortableTextBody(parsed)
  if (!result.ok) {
    throw result.error
  }
  return canonicalizeLexicalBodyShape(convertPtBodyToLexical(canonicalizePortableTextBodyShape(result.body)))
}

/** Re-run the read-path gate on the converted body so the stored form is pinned against what the server parses. */
function gateConverted(converted: LexicalBody | LexicalCommentBody, kind: 'content' | 'comment'): void {
  if (kind === 'comment') {
    parseLexicalCommentBody(converted)
  } else {
    parseLexicalBody(converted)
  }
}

/** Spot-render through the string renderer (default mode) to prove the body survives SSR. */
function spotRender(body: LexicalBody): void {
  lexicalBodyToHtml(body, { headingSlugs: [], mode: 'default', footnotesSectionTitle: '注' })
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 300 ? `${message.slice(0, 300)}…` : message
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2))
  const dbPath = flags['--db']
  if (dbPath === undefined || dbPath === 'true') {
    process.stderr.write(`${USAGE}\n`)
    process.exit(2)
  }
  if (!existsSync(dbPath)) {
    process.stderr.write(`database not found: ${dbPath}\n`)
    process.exit(2)
  }
  const checkOnly = flags['--check'] === 'true'
  const backupPath = flags['--backup']
  const verify = flags['--verify'] === 'true'
  const reportPath = flags['--report'] ?? 'migration-report.jsonl'

  if (!checkOnly) {
    if (backupPath === undefined || backupPath === 'true') {
      process.stderr.write(`--backup <path> is required unless --check is given\n${USAGE}\n`)
      process.exit(2)
    }
    copyFileSync(dbPath, backupPath)
    process.stdout.write(`backup written to ${backupPath}\n`)
  }

  const db = new DatabaseSync(dbPath)
  const report: RowResult[] = []
  let migrated = 0
  let skipped = 0
  let failed = 0

  const processTable = (kind: 'content' | 'comment'): void => {
    const select = db.prepare(`SELECT id, body FROM ${kind}`)
    const update = db.prepare(`UPDATE ${kind} SET body = ? WHERE id = ?`)
    const rows = select.all().map((row) => ({ id: Number(row.id), body: String(row.body) }))
    for (const row of rows) {
      const beforeBytes = Buffer.byteLength(row.body)
      let parsed: unknown
      try {
        parsed = JSON.parse(row.body)
      } catch {
        report.push({ kind, id: row.id, status: 'error', beforeBytes, error: 'invalid-json' })
        failed += 1
        continue
      }
      if (!isPortableTextShape(parsed)) {
        report.push({ kind, id: row.id, status: 'skipped-lexical', beforeBytes })
        skipped += 1
        continue
      }
      try {
        const converted = convertRow(parsed, kind)
        gateConverted(converted, kind)
        const serialized = JSON.stringify(converted)
        if (!checkOnly) {
          update.run(serialized, row.id)
        }
        report.push({
          kind,
          id: row.id,
          status: 'migrated',
          beforeBytes,
          afterBytes: Buffer.byteLength(serialized),
        })
        migrated += 1
      } catch (error) {
        report.push({ kind, id: row.id, status: 'error', beforeBytes, error: truncateError(error) })
        failed += 1
      }
    }
  }

  if (!checkOnly) {
    db.exec('BEGIN')
  }
  processTable('content')
  processTable('comment')
  if (!checkOnly) {
    db.exec('COMMIT')
  }
  db.close()

  writeFileSync(reportPath, report.map((entry) => JSON.stringify(entry)).join('\n') + '\n')
  process.stdout.write(
    `report: ${reportPath}\n  migrated: ${migrated}\n  skipped (already lexical): ${skipped}\n  failed: ${failed}\n`,
  )

  if (verify && !checkOnly) {
    verifyDatabase(dbPath, report)
  }

  process.exit(failed > 0 ? 1 : 0)
}

/**
 * Re-read every row after migration: gate each body and spot-render a few
 * content rows. Rows that failed migration (still PT) are skipped — they
 * are reported in the JSONL with their error; the invariant verified here
 * is "every migrated/skipped row parses and survives SSR".
 */
function verifyDatabase(dbPath: string, report: readonly RowResult[]): void {
  const skippedKeys = new Set(
    report.filter((entry) => entry.status === 'error').map((entry) => `${entry.kind}:${entry.id}`),
  )
  const db = new DatabaseSync(dbPath)
  let failures = 0
  let contentRows = 0
  let commentRows = 0
  let rendered = 0

  const checkTable = (kind: 'content' | 'comment'): void => {
    const rows = db
      .prepare(`SELECT id, body FROM ${kind}`)
      .all()
      .map((row) => ({ id: Number(row.id), body: String(row.body) }))
    if (kind === 'content') {
      contentRows = rows.length
    } else {
      commentRows = rows.length
    }
    for (const row of rows) {
      if (skippedKeys.has(`${kind}:${row.id}`)) {
        continue
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(row.body)
      } catch {
        process.stderr.write(`verify: ${kind}#${row.id} is not valid JSON\n`)
        failures += 1
        continue
      }
      try {
        if (kind === 'comment') {
          parseLexicalCommentBody(parsed)
        } else {
          const body = parseLexicalBody(parsed)
          if (rendered < 3) {
            spotRender(body)
            rendered += 1
          }
        }
      } catch (error) {
        process.stderr.write(`verify: ${kind}#${row.id} failed gate: ${truncateError(error)}\n`)
        failures += 1
      }
    }
  }

  checkTable('content')
  checkTable('comment')
  db.close()
  process.stdout.write(
    `verify: content rows=${contentRows} comment rows=${commentRows} spot-rendered=${rendered} failures=${failures}\n`,
  )
}

main()

#!/usr/bin/env node
//
// Read-only verifier that checks every local comment.body for migration and
// render parity from PortableText to Inkling JSON.
//
//   pnpm exec vite-node scripts/inkling-poc/verify-comment-local-db.ts
//
// The script never writes to the database, never prints the database URL, and
// never emits raw comment text. The verification report is written to
// tmp/inkling-poc/comment-migration-report.json (ignored by git).
//

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

import { commentInklingToEmailHtml } from '@/server/domains/inkling/comment-email'
import { commentBodyToHtml } from '@/server/domains/pt/services/comment-to-html'
import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { commentPortableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { safeValidateCommentBody } from '@/shared/pt/comment-schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'inkling-poc')
const OUT_FILE = join(OUT_DIR, 'comment-migration-report.json')

const DATABASE_URL = process.env.DATABASE_URL

interface CommentRow {
  id: bigint
  body: unknown
}

interface CommentReportRow {
  id: number
  ok: boolean
  error?: string
  oldHtmlEmpty: boolean
  newHtmlEmpty: boolean
  oldPlainText: string
  newPlainText: string
}

interface CommentMigrationReport {
  generatedAt: string
  total: number
  converted: number
  mismatches: CommentReportRow[]
}

function normalizePlainText(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function extractPlainTextFromHtml(html: string): string {
  return normalizePlainText(html)
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function verifyComment(row: CommentRow): CommentReportRow {
  const id = Number(row.id)

  const ptValidation = safeValidateCommentBody(row.body)
  if (!ptValidation.ok) {
    return {
      id,
      ok: false,
      error: `Invalid old comment PT: ${ptValidation.error.message}`,
      oldHtmlEmpty: !Array.isArray(row.body) || row.body.length === 0,
      newHtmlEmpty: true,
      oldPlainText: '',
      newPlainText: '',
    }
  }

  const oldHtml = commentBodyToHtml(ptValidation.body)
  const oldPlainText = extractPlainTextFromHtml(oldHtml)

  try {
    const document = commentPortableTextToInklingDocument(ptValidation.body)

    const modeValidation = validateInklingDocumentForMode(document, 'comment')
    if (!modeValidation.ok) {
      return {
        id,
        ok: false,
        error: `Feature validation failed for comment: ${modeValidation.forbiddenType} at ${modeValidation.path}`,
        oldHtmlEmpty: oldHtml.length === 0,
        newHtmlEmpty: true,
        oldPlainText,
        newPlainText: '',
      }
    }

    const newHtml = commentInklingToEmailHtml(document)
    const newPlainText = extractPlainTextFromHtml(newHtml)
    const plainTextMatch = oldPlainText === newPlainText
    const htmlEmptyMatch = (oldHtml.length === 0) === (newHtml.length === 0)
    const ok = plainTextMatch && htmlEmptyMatch

    return {
      id,
      ok,
      error: ok ? undefined : `Rendered text mismatch: old="${oldPlainText}" new="${newPlainText}"`,
      oldHtmlEmpty: oldHtml.length === 0,
      newHtmlEmpty: newHtml.length === 0,
      oldPlainText,
      newPlainText,
    }
  } catch (error) {
    return {
      id,
      ok: false,
      error: formatError(error),
      oldHtmlEmpty: oldHtml.length === 0,
      newHtmlEmpty: true,
      oldPlainText,
      newPlainText: '',
    }
  }
}

async function main(): Promise<void> {
  if (DATABASE_URL === undefined || DATABASE_URL.length === 0) {
    process.stderr.write('DATABASE_URL is not set; cannot run verifier.\n')
    process.exit(1)
  }

  const client = new Client({ connectionString: DATABASE_URL })

  try {
    await client.connect()
  } catch (error) {
    process.stderr.write(`Failed to connect to database: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }

  try {
    await client.query('BEGIN')
    await client.query('SET TRANSACTION READ ONLY')

    const result = await client.query<CommentRow>('SELECT id, body FROM comment ORDER BY id')

    await client.query('COMMIT')

    const rows: CommentReportRow[] = []
    for (const row of result.rows) {
      rows.push(verifyComment(row))
    }

    const mismatches = rows.filter((row) => !row.ok)
    const report: CommentMigrationReport = {
      generatedAt: new Date().toISOString(),
      total: result.rows.length,
      converted: result.rows.length - mismatches.length,
      mismatches,
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(OUT_FILE, JSON.stringify(report, null, 2))

    process.stdout.write(`comments converted: ${report.converted}/${report.total}\n`)
    process.stdout.write(`Report: ${OUT_FILE}\n`)

    if (mismatches.length > 0) {
      process.stderr.write(`Mismatches: ${mismatches.length}\n`)
      for (const row of mismatches.slice(0, 10)) {
        process.stderr.write(`  comment #${row.id}: ${row.error ?? 'unknown error'}\n`)
      }
      if (mismatches.length > 10) {
        process.stderr.write(`  ... and ${mismatches.length - 10} more\n`)
      }
      process.exit(1)
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    process.stderr.write(`Verification failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  } finally {
    await client.end()
  }
}

void main()

#!/usr/bin/env node
//
// Read-only verifier for footnote migration parity.
//
//   pnpm exec vite-node scripts/inkling-poc/verify-footnotes-local-db.ts
//
// The script scans every local content.body row that contains footnotes,
// converts it to Inkling, and asserts:
//   - PT and Inkling ref counts match
//   - PT and Inkling definition counts match
//   - Inkling display indices follow first-reference order
//   - Footnote section plaintext is preserved
//
// The script never writes to the database, never prints the database URL, and
// never emits raw body text or URLs. The verification report is written to
// tmp/inkling-poc/footnote-report.json (ignored by git).
//

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

import type { PortableTextBody } from '@/shared/pt/schema'

import {
  collectFootnoteDefinitions,
  collectFootnoteRefs,
  inklingFootnoteSectionToPlainText,
  synchronizeInklingFootnoteIndices,
} from '@/shared/inkling/footnotes'
import { portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { footnoteChildrenToPlainText } from '@/shared/pt/footnote-merge'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'inkling-poc')
const OUT_FILE = join(OUT_DIR, 'footnote-report.json')

const DATABASE_URL = process.env.DATABASE_URL

interface ContentRow {
  id: bigint
  body: unknown
}

interface FootnoteReportRow {
  id: number
  ptRefCount: number
  ptDefinitionCount: number
  inklingRefCount: number
  inklingDefinitionCount: number
  indicesMatchFirstRefOrder: boolean
  plainTextMatch: boolean
  hasMissingDefinitions: boolean
  hasOrphanDefinitions: boolean
  ok: boolean
  error?: string
}

interface FootnoteReport {
  generatedAt: string
  summary: {
    totalRows: number
    rowsWithFootnotes: number
    rowsProcessed: number
    failedRows: number
    mismatchRows: number
  }
  rows: FootnoteReportRow[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function countPtFootnotes(body: readonly unknown[]): { refCount: number; definitionCount: number } {
  let refCount = 0
  let definitionCount = 0

  function countInlineMarks(spans: readonly unknown[], markDefs: readonly unknown[]): void {
    const refKeys = new Set<string>()
    for (const markDef of markDefs) {
      if (isPlainObject(markDef) && typeof markDef._key === 'string' && markDef._type === 'footnoteRef') {
        refKeys.add(markDef._key)
      }
    }
    for (const span of spans) {
      if (!isPlainObject(span) || span._type !== 'span') {
        continue
      }
      const marks = Array.isArray(span.marks) ? span.marks : []
      for (const mark of marks) {
        if (typeof mark === 'string' && refKeys.has(mark)) {
          refCount += 1
        }
      }
    }
  }

  function visitBlocks(blocks: readonly unknown[]): void {
    for (const block of blocks) {
      visitBlock(block)
    }
  }

  function visitBlock(block: unknown): void {
    if (!isPlainObject(block)) {
      return
    }
    const type = block._type
    if (typeof type !== 'string') {
      return
    }

    switch (type) {
      case 'block': {
        const children = Array.isArray(block.children) ? block.children : []
        const markDefs = Array.isArray(block.markDefs) ? block.markDefs : []
        countInlineMarks(children, markDefs)
        break
      }
      case 'table': {
        const rows = Array.isArray(block.rows) ? block.rows : []
        for (const row of rows) {
          if (!isPlainObject(row)) {
            continue
          }
          const cells = Array.isArray(row.cells) ? row.cells : []
          for (const cell of cells) {
            if (!isPlainObject(cell)) {
              continue
            }
            const content = Array.isArray(cell.content) ? cell.content : []
            const cellMarkDefs = Array.isArray(cell.markDefs) ? cell.markDefs : []
            countInlineMarks(content, cellMarkDefs)
          }
        }
        break
      }
      case 'footnoteDefinition': {
        definitionCount += 1
        break
      }
      case 'solution':
      case 'twoColumn': {
        const children = type === 'solution' ? block.children : undefined
        const left = type === 'twoColumn' ? block.left : undefined
        const right = type === 'twoColumn' ? block.right : undefined
        if (Array.isArray(children)) {
          visitBlocks(children)
        }
        if (Array.isArray(left)) {
          visitBlocks(left)
        }
        if (Array.isArray(right)) {
          visitBlocks(right)
        }
        break
      }
    }
  }

  visitBlocks(body)
  return { refCount, definitionCount }
}

function ptFootnoteSectionPlainText(body: readonly unknown[]): string {
  const lines: string[] = []
  for (const block of body) {
    if (isPlainObject(block) && block._type === 'footnoteDefinition' && Array.isArray(block.children)) {
      const text = footnoteChildrenToPlainText(block.children)
      if (text.length > 0) {
        lines.push(text)
      }
    }
  }
  return lines.join('\n').trim()
}

function verifyFootnoteRow(id: number, body: unknown): FootnoteReportRow {
  // The database may contain legacy non-array defaults; verifier treats them as empty bodies.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const ptBody = Array.isArray(body) ? (body as PortableTextBody) : []
  const ptCounts = countPtFootnotes(ptBody)

  if (ptCounts.refCount === 0 && ptCounts.definitionCount === 0) {
    return {
      id,
      ptRefCount: 0,
      ptDefinitionCount: 0,
      inklingRefCount: 0,
      inklingDefinitionCount: 0,
      indicesMatchFirstRefOrder: true,
      plainTextMatch: true,
      hasMissingDefinitions: false,
      hasOrphanDefinitions: false,
      ok: true,
    }
  }

  try {
    const document = portableTextToInklingDocument(ptBody)
    const refs = collectFootnoteRefs(document)
    const defs = collectFootnoteDefinitions(document)
    const syncResult = synchronizeInklingFootnoteIndices(document)

    const ptPlainText = ptFootnoteSectionPlainText(ptBody)
    const inklingPlainText = inklingFootnoteSectionToPlainText(syncResult.document)

    const refCountMatch = ptCounts.refCount === refs.length
    const definitionCountMatch = ptCounts.definitionCount === defs.length

    // After synchronization, every referenced definition must have an index equal to its
    // position in first-reference order (1-based).
    const inklingRefs = collectFootnoteRefs(syncResult.document)
    const firstRefOrder: string[] = []
    const seen = new Set<string>()
    for (const ref of inklingRefs) {
      if (!seen.has(ref.targetKey)) {
        seen.add(ref.targetKey)
        firstRefOrder.push(ref.targetKey)
      }
    }
    const keyToExpectedIndex = new Map(firstRefOrder.map((k, i) => [k, i + 1]))
    const syncedDefs = collectFootnoteDefinitions(syncResult.document)
    const indicesMatch = syncedDefs.every((def) => {
      const expected = keyToExpectedIndex.get(def.targetKey)
      return expected === undefined || def.index === expected
    })

    const plainTextMatch = ptPlainText === inklingPlainText
    const ok = refCountMatch && definitionCountMatch && indicesMatch && plainTextMatch

    return {
      id,
      ptRefCount: ptCounts.refCount,
      ptDefinitionCount: ptCounts.definitionCount,
      inklingRefCount: refs.length,
      inklingDefinitionCount: defs.length,
      indicesMatchFirstRefOrder: indicesMatch,
      plainTextMatch,
      hasMissingDefinitions: syncResult.missing.length > 0,
      hasOrphanDefinitions: syncResult.orphans.length > 0,
      ok,
      error: ok
        ? undefined
        : `Mismatch: refs ${ptCounts.refCount}→${refs.length}, defs ${ptCounts.definitionCount}→${defs.length}, indices ${indicesMatch}, plaintext ${plainTextMatch}`,
    }
  } catch (error) {
    return {
      id,
      ptRefCount: ptCounts.refCount,
      ptDefinitionCount: ptCounts.definitionCount,
      inklingRefCount: 0,
      inklingDefinitionCount: 0,
      indicesMatchFirstRefOrder: false,
      plainTextMatch: false,
      hasMissingDefinitions: false,
      hasOrphanDefinitions: false,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
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

    const contentResult = await client.query<ContentRow>('SELECT id, body FROM content ORDER BY id')

    await client.query('COMMIT')

    const rows: FootnoteReportRow[] = []
    let rowsWithFootnotes = 0
    let failedRows = 0
    let mismatchRows = 0

    for (const row of contentResult.rows) {
      const reportRow = verifyFootnoteRow(Number(row.id), row.body)
      if (reportRow.ptRefCount > 0 || reportRow.ptDefinitionCount > 0) {
        rowsWithFootnotes += 1
      }
      if (reportRow.error !== undefined) {
        failedRows += 1
      }
      if (!reportRow.ok && reportRow.error === undefined) {
        mismatchRows += 1
      }
      rows.push(reportRow)
    }

    const report: FootnoteReport = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRows: contentResult.rows.length,
        rowsWithFootnotes,
        rowsProcessed: contentResult.rows.length,
        failedRows,
        mismatchRows,
      },
      rows,
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(OUT_FILE, JSON.stringify(report, null, 2))

    process.stdout.write(`Total rows: ${report.summary.totalRows}\n`)
    process.stdout.write(`Rows with footnotes: ${report.summary.rowsWithFootnotes}\n`)
    process.stdout.write(`Processed: ${report.summary.rowsProcessed}\n`)
    process.stdout.write(`Failed: ${report.summary.failedRows}\n`)
    process.stdout.write(`Mismatches: ${report.summary.mismatchRows}\n`)
    process.stdout.write(`Report: ${OUT_FILE}\n`)

    if (failedRows > 0 || mismatchRows > 0) {
      const badRows = rows.filter((r) => !r.ok)
      process.stderr.write(`Problem rows: ${badRows.length}\n`)
      for (const row of badRows.slice(0, 10)) {
        process.stderr.write(`  content #${row.id}: ${row.error ?? 'mismatch'}\n`)
      }
      if (badRows.length > 10) {
        process.stderr.write(`  ... and ${badRows.length - 10} more\n`)
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

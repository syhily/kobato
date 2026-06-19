#!/usr/bin/env node
//
// Read-only inventory of every local `content.body` and `comment.body` shape.
//
//   pnpm exec vite-node scripts/inkling-poc/inventory-local-bodies.ts
//
// The script never writes to the database, never prints the database URL, and
// never emits raw body text or URLs. The structural report is written to
// `tmp/inkling-poc/body-format-inventory.json` (ignored by git).
//

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

import {
  collectBodyShapeStats,
  collectValidationIssuePaths,
  mergeBodyShapeStats,
  type BodyShapeStats,
} from '@/server/domains/inkling/migration-support/body-shape-inventory'
import { safeValidateCommentBody } from '@/shared/pt/comment-schema'
import { safeValidatePortableTextBody } from '@/shared/pt/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'inkling-poc')
const OUT_FILE = join(OUT_DIR, 'body-format-inventory.json')

const DATABASE_URL = process.env.DATABASE_URL

interface ContentRow {
  id: bigint
  type: string
  owner_id: bigint
  status: string
  body: unknown
}

interface CommentRow {
  id: bigint
  type: string
  owner_id: bigint
  body: unknown
}

interface CoverageChecklist {
  article: Record<string, boolean>
  comment: Record<string, boolean>
}

interface InventoryReport {
  generatedAt: string
  sourceCommit: string
  contentRowCount: number
  commentRowCount: number
  aggregate: BodyShapeStats
  coverageChecklist: CoverageChecklist
}

const ARTICLE_BLOCK_TYPES = [
  'image',
  'code',
  'mathBlock',
  'horizontalRule',
  'musicPlayer',
  'table',
  'solution',
  'twoColumn',
  'footnoteDefinition',
]

const ARTICLE_MARK_TYPES = ['strong', 'em', 'underline', 'code', 'strike-through', 'link', 'mathInline', 'footnoteRef']

const COMMENT_BLOCK_TYPES = ['code', 'mathBlock']

const COMMENT_MARK_TYPES = ['strong', 'em', 'underline', 'code', 'strike-through', 'link', 'mathInline']

function getSourceCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: resolve(__dirname, '..', '..') }).trim()
  } catch {
    return 'unknown'
  }
}

function hasCount(counter: Record<string, number>, key: string): boolean {
  return (counter[key] ?? 0) > 0
}

function buildCoverageChecklist(aggregate: BodyShapeStats): CoverageChecklist {
  return {
    article: {
      'block-style:normal': hasCount(aggregate.blockStyleCounts, 'normal'),
      'block-style:h1': hasCount(aggregate.blockStyleCounts, 'h1'),
      'block-style:h2': hasCount(aggregate.blockStyleCounts, 'h2'),
      'block-style:h3': hasCount(aggregate.blockStyleCounts, 'h3'),
      'block-style:h4': hasCount(aggregate.blockStyleCounts, 'h4'),
      'block-style:blockquote': hasCount(aggregate.blockStyleCounts, 'blockquote'),
      'list-type:bullet': hasCount(aggregate.listTypeCounts, 'bullet'),
      'list-type:number': hasCount(aggregate.listTypeCounts, 'number'),
      'list-level:1': hasCount(aggregate.listLevelCounts, '1'),
      'list-level:2': hasCount(aggregate.listLevelCounts, '2'),
      'list-level:3': hasCount(aggregate.listLevelCounts, '3'),
      'list-level:4': hasCount(aggregate.listLevelCounts, '4'),
      'list-level:5': hasCount(aggregate.listLevelCounts, '5'),
      'list-level:6': hasCount(aggregate.listLevelCounts, '6'),
      'align:left': hasCount(aggregate.alignCounts, 'left'),
      'align:center': hasCount(aggregate.alignCounts, 'center'),
      'align:right': hasCount(aggregate.alignCounts, 'right'),
      ...Object.fromEntries(
        ARTICLE_BLOCK_TYPES.map((type) => [`block:${type}`, hasCount(aggregate.blockTypeCounts, type)]),
      ),
      ...Object.fromEntries(
        ARTICLE_MARK_TYPES.map((type) => [`mark:${type}`, hasCount(aggregate.markTypeCounts, type)]),
      ),
      'nested:solution': Object.keys(aggregate.nestedBlockCounts.solution ?? {}).length > 0,
      'nested:twoColumn': Object.keys(aggregate.nestedBlockCounts.twoColumn ?? {}).length > 0,
      'nested:footnoteDefinition': Object.keys(aggregate.nestedBlockCounts.footnoteDefinition ?? {}).length > 0,
      'table:any': Object.keys(aggregate.tableDimensionCounts).length > 0,
    },
    comment: {
      'block-style:normal': hasCount(aggregate.blockStyleCounts, 'normal'),
      'block-style:blockquote': hasCount(aggregate.blockStyleCounts, 'blockquote'),
      'list-type:bullet': hasCount(aggregate.listTypeCounts, 'bullet'),
      'list-type:number': hasCount(aggregate.listTypeCounts, 'number'),
      'list-level:1': hasCount(aggregate.listLevelCounts, '1'),
      'list-level:2': hasCount(aggregate.listLevelCounts, '2'),
      'list-level:3': hasCount(aggregate.listLevelCounts, '3'),
      'list-level:4': hasCount(aggregate.listLevelCounts, '4'),
      ...Object.fromEntries(
        COMMENT_BLOCK_TYPES.map((type) => [`block:${type}`, hasCount(aggregate.blockTypeCounts, type)]),
      ),
      ...Object.fromEntries(
        COMMENT_MARK_TYPES.map((type) => [`mark:${type}`, hasCount(aggregate.markTypeCounts, type)]),
      ),
    },
  }
}

async function main(): Promise<void> {
  if (DATABASE_URL === undefined || DATABASE_URL.length === 0) {
    process.stderr.write('DATABASE_URL is not set; cannot run inventory.\n')
    process.exit(1)
  }

  const client = new Client({ connectionString: DATABASE_URL })

  try {
    await client.connect()
  } catch (error) {
    process.stderr.write(`Failed to connect to database: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }

  const statsList: BodyShapeStats[] = []

  try {
    await client.query('BEGIN')
    await client.query('SET TRANSACTION READ ONLY')

    const contentResult = await client.query<ContentRow>(
      'SELECT id, type, owner_id, status, body FROM content ORDER BY id',
    )
    const commentResult = await client.query<CommentRow>('SELECT id, type, owner_id, body FROM comment ORDER BY id')

    await client.query('COMMIT')

    const contentFailures: BodyShapeStats['validationFailures'] = []
    for (const row of contentResult.rows) {
      const stats = collectBodyShapeStats(row.body)
      const validation = safeValidatePortableTextBody(row.body)
      if (!validation.ok) {
        contentFailures.push({
          table: 'content',
          id: Number(row.id),
          paths: collectValidationIssuePaths(validation.error),
        })
      }
      statsList.push(stats)
    }

    const commentFailures: BodyShapeStats['validationFailures'] = []
    for (const row of commentResult.rows) {
      const stats = collectBodyShapeStats(row.body)
      const validation = safeValidateCommentBody(row.body)
      if (!validation.ok) {
        commentFailures.push({
          table: 'comment',
          id: Number(row.id),
          paths: collectValidationIssuePaths(validation.error),
        })
      }
      statsList.push(stats)
    }

    const aggregate = mergeBodyShapeStats(statsList)
    aggregate.validationFailures.push(...contentFailures, ...commentFailures)

    const report: InventoryReport = {
      generatedAt: new Date().toISOString(),
      sourceCommit: getSourceCommit(),
      contentRowCount: contentResult.rows.length,
      commentRowCount: commentResult.rows.length,
      aggregate,
      coverageChecklist: buildCoverageChecklist(aggregate),
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(OUT_FILE, JSON.stringify(report, null, 2))

    process.stdout.write(`Report: ${OUT_FILE}\n`)
    process.stdout.write(`Content rows: ${report.contentRowCount}\n`)
    process.stdout.write(`Comment rows: ${report.commentRowCount}\n`)
    if (aggregate.validationFailures.length > 0) {
      process.stdout.write(`Validation failures: ${aggregate.validationFailures.length}\n`)
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    process.stderr.write(`Inventory failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  } finally {
    await client.end()
  }
}

void main()

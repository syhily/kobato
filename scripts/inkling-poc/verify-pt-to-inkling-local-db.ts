#!/usr/bin/env node
//
// Read-only verifier that converts every local content.body and comment.body
// from PortableText to Inkling JSON.
//
//   pnpm exec vite-node scripts/inkling-poc/verify-pt-to-inkling-local-db.ts
//
// The script never writes to the database, never prints the database URL, and
// never emits raw body text or URLs. The verification report is written to
// tmp/inkling-poc/pt-to-inkling-report.json (ignored by git).
//

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

import { verifyPtToInklingMigration } from '@/server/domains/inkling/poc/migration-verifier'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'inkling-poc')
const OUT_FILE = join(OUT_DIR, 'pt-to-inkling-report.json')

const DATABASE_URL = process.env.DATABASE_URL

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
    const report = await verifyPtToInklingMigration(client)

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(OUT_FILE, JSON.stringify(report, null, 2))

    const { summary } = report
    process.stdout.write(`content converted: ${summary.contentConverted}/${summary.contentTotal}\n`)
    process.stdout.write(`comments converted: ${summary.commentConverted}/${summary.commentTotal}\n`)
    process.stdout.write(`Report: ${OUT_FILE}\n`)

    if (summary.failedRows.length > 0) {
      process.stderr.write(`Failed rows: ${summary.failedRows.length}\n`)
      for (const row of summary.failedRows.slice(0, 10)) {
        process.stderr.write(`  ${row.table} #${row.id}: ${row.error ?? 'unknown error'}\n`)
      }
      if (summary.failedRows.length > 10) {
        process.stderr.write(`  ... and ${summary.failedRows.length - 10} more\n`)
      }
      process.exit(1)
    }
  } catch (error) {
    process.stderr.write(`Verification failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  } finally {
    await client.end()
  }
}

void main()

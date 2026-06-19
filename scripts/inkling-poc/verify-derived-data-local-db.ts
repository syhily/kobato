#!/usr/bin/env node
//
// Read-only verifier that compares PT-derived and Inkling-derived data for
// every local content.body row.
//
//   pnpm exec vite-node scripts/inkling-poc/verify-derived-data-local-db.ts
//
// The script never writes to the database, never prints the database URL, and
// never emits raw body text or URLs. The parity report is written to
// tmp/inkling-poc/derived-data-parity-report.json (ignored by git).
//

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

import { verifyDerivedDataParity } from '@/server/domains/inkling/migration-support/derived-data-verifier'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'inkling-poc')
const OUT_FILE = join(OUT_DIR, 'derived-data-parity-report.json')

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
    const report = await verifyDerivedDataParity(client)

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(OUT_FILE, JSON.stringify(report, null, 2))

    process.stdout.write(`content processed: ${report.contentProcessed}/${report.contentTotal}\n`)
    process.stdout.write(`mismatches: ${report.mismatchCount}\n`)
    process.stdout.write(`Report: ${OUT_FILE}\n`)

    if (report.mismatchCount > 0) {
      process.stderr.write(`Mismatched rows: ${report.mismatchCount}\n`)
      for (const mismatch of report.mismatches.slice(0, 10)) {
        process.stderr.write(
          `  content #${mismatch.rowId}: ${mismatch.categories.join(', ')}${mismatch.error ? ` (${mismatch.error})` : ''}\n`,
        )
      }
      if (report.mismatches.length > 10) {
        process.stderr.write(`  ... and ${report.mismatches.length - 10} more\n`)
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

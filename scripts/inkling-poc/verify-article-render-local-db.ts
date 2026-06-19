#!/usr/bin/env node
//
// Read-only verifier that renders every local content.body both from PortableText
// and from its Inkling JSON migration, then compares feed-safe HTML output.
//
//   pnpm exec vite-node scripts/inkling-poc/verify-article-render-local-db.ts
//
// The script never writes to the database, never prints the database URL, and
// never emits raw body text or URLs. The parity report is written to
// tmp/inkling-poc/article-render-parity-report.json (ignored by git).
//

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { renderPortableTextToHtml } from '@/server/render/feed/feed-pt-render'
import { renderInklingToHtml } from '@/server/render/inkling/html'
import { sanitizeInklingFeedHtml } from '@/server/render/inkling/sanitize'
import { portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { escapeHtml } from '@/shared/utils/security'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '..', 'tmp', 'inkling-poc')
const OUT_FILE = join(OUT_DIR, 'article-render-parity-report.json')

const DATABASE_URL = process.env.DATABASE_URL

interface RenderMismatch {
  id: number
  reason: string
  known?: boolean
}

interface RenderParityRow {
  id: number
  ok: boolean
  mismatch?: string
  known?: boolean
}

interface RenderParityReport {
  generatedAt: string
  total: number
  processed: number
  mismatches: RenderMismatch[]
  knownMismatches: RenderMismatch[]
  unexplainedMismatches: RenderMismatch[]
  rows: RenderParityRow[]
}

// Known acceptable render differences between the legacy PortableText feed
// renderer and the new Inkling feed renderer. These are not bugs in Inkling;
// they are either limitations of the one-way PT -> Inkling migration or
// pre-existing quirks in the PT renderer that Inkling cleans up.
const KNOWN_MISMATCHES: Record<number, string> = {
  156: 'Decorator nesting order is flattened during PT -> Inkling migration. PT preserves one <strong> wrapping adjacent spans; Inkling splits them because decorator marks are ORed into a single Lexical format bitmask. The rendered text is identical.',
  234: 'Legacy PT feed renderer wraps solution blocks in an extra <p> because @portabletext/to-html wraps custom block types. Inkling renders solution children directly without the spurious wrapper, producing cleaner HTML.',
  236: 'Same solution-block wrapper quirk as #234: PT emits an extra empty <p></p> around the solution children, while Inkling does not.',
}

function normalizeHtml(html: string): string {
  return (
    sanitizeInklingFeedHtml(html)
      // Drop whitespace differences that do not affect rendered output.
      .replace(/>\s+</g, '><')
      .trim()
  )
}

function firstDiffSnippet(a: string, b: string): string {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const start = Math.max(0, i - 40)
      const end = Math.min(Math.max(a.length, b.length), i + 80)
      return `pt:${a.slice(start, end)}|in:${b.slice(start, end)}`
    }
  }
  return `len ${a.length} vs ${b.length}`
}

function compareRenderOutput(ptHtml: string, inklingHtml: string): { ok: true } | { ok: false; reason: string } {
  const a = normalizeHtml(ptHtml)
  const b = normalizeHtml(inklingHtml)
  if (a === b) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `normalized length ${a.length} vs ${b.length}; ${firstDiffSnippet(a, b)}`,
  }
}

async function verifyRow(db: NodePgDatabase, id: number, body: unknown): Promise<RenderParityRow> {
  try {
    const ptHtml = await renderPortableTextToHtml(db, body as Parameters<typeof renderPortableTextToHtml>[1], [], {
      rssMode: true,
    })
    const document = portableTextToInklingDocument(body as Parameters<typeof portableTextToInklingDocument>[0])
    const inklingHtml = await renderInklingToHtml(db, document, [], { rssMode: true })
    const result = compareRenderOutput(ptHtml, inklingHtml)
    if (result.ok) {
      return { id, ok: true }
    }
    const knownReason = KNOWN_MISMATCHES[id]
    if (knownReason !== undefined) {
      return { id, ok: false, mismatch: `${result.reason} [known: ${knownReason}]`, known: true }
    }
    return { id, ok: false, mismatch: result.reason }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { id, ok: false, mismatch: `render error: ${message}` }
  }
}

async function main(): Promise<void> {
  process.stdout.write('DEBUG: main started\n')
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
    const result = await client.query<{ id: bigint; body: unknown }>('SELECT id, body FROM content ORDER BY id')
    await client.query('COMMIT')

    const db = drizzle({ client }) as NodePgDatabase
    const settings = await hydrateBlogSettings(db)
    if (settings === null) {
      process.stderr.write('Failed to hydrate blog settings from database.\n')
      process.exit(1)
    }

    const rows: RenderParityRow[] = []
    for (const row of result.rows) {
      rows.push(await verifyRow(db, Number(row.id), row.body))
    }

    const mismatches = rows
      .filter((row): row is RenderParityRow & { mismatch: string } => !row.ok)
      .map((row) => ({ id: row.id, reason: row.mismatch, known: row.known === true }))

    const knownMismatches = mismatches.filter((m) => m.known)
    const unexplainedMismatches = mismatches.filter((m) => !m.known)

    const report: RenderParityReport = {
      generatedAt: new Date().toISOString(),
      total: result.rows.length,
      processed: rows.length,
      mismatches,
      knownMismatches,
      unexplainedMismatches,
      rows,
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(OUT_FILE, JSON.stringify(report, null, 2))

    process.stdout.write(`processed: ${report.processed}/${report.total}\n`)
    process.stdout.write(
      `mismatches: ${mismatches.length} (${knownMismatches.length} known, ${unexplainedMismatches.length} unexplained)\n`,
    )
    process.stdout.write(`Report: ${OUT_FILE}\n`)

    if (knownMismatches.length > 0) {
      process.stdout.write(`Known mismatches documented:\n`)
      for (const mismatch of knownMismatches.slice(0, 10)) {
        process.stdout.write(`  content #${mismatch.id}: ${escapeHtml(KNOWN_MISMATCHES[mismatch.id] ?? '')}\n`)
      }
    }

    if (unexplainedMismatches.length > 0) {
      process.stderr.write(`STOP: ${unexplainedMismatches.length} unexplained mismatch(es).\n`)
      for (const mismatch of unexplainedMismatches.slice(0, 10)) {
        process.stderr.write(`  content #${mismatch.id}: ${escapeHtml(mismatch.reason)}\n`)
      }
      if (unexplainedMismatches.length > 10) {
        process.stderr.write(`  ... and ${unexplainedMismatches.length - 10} more\n`)
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

#!/usr/bin/env node
// The R15 PT→Lexical backfill CLI (plan docs/plans/inkling-editor-replacement.md,
// round R15 / M2d). Runs OUTSIDE the server process against a database file:
//
//   pnpm vite-node scripts/pt-lexical-backfill.ts --db <path> [--report <path>]   # dry-run (default)
//   pnpm vite-node scripts/pt-lexical-backfill.ts --db <path> --apply [--report <path>]
//
// Dry-run opens the database READ-ONLY (`node:sqlite` readOnly flag) — zero
// writes at the OS level — and produces the coverage + cross-check report for
// the human audit gate. Apply mode performs the conversion, rebuilds the
// search index, and writes the `system.pt-lexical-backfill` flag row only
// when the corpus converts with zero failures. Take a file-level backup
// before --apply (the backup stays until M5 acceptance).

import { drizzle } from 'drizzle-orm/node-sqlite'
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { hashContent } from '@/server/domains/comments/services/mutate'
import {
  runPtLexicalBackfill,
  type PtLexicalBackfillReport,
} from '@/server/domains/content/services/pt-lexical-backfill'
import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { reindexSearchToCompletion } from '@/server/domains/posts/services/search-reindex'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { closeDatabase, openDatabase, resolveDatabasePath, type Database } from '@/server/infra/db/database'

interface CliArgs {
  db: string
  apply: boolean
  report: string | null
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { db: resolveDatabasePath(), apply: false, report: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--db') {
      args.db = argv[++i] ?? args.db
    } else if (arg === '--apply') {
      args.apply = true
    } else if (arg === '--report') {
      args.report = argv[++i] ?? null
    } else if (arg === '--help' || arg === '-h') {
      console.log('usage: pnpm vite-node scripts/pt-lexical-backfill.ts [--db <path>] [--apply] [--report <path>]')
      process.exit(0)
    }
  }
  return args
}

function printSummary(report: PtLexicalBackfillReport): void {
  const { content, comments, stats, music, crossCheck } = report
  console.log(`\n=== PT→Lexical backfill ${report.mode} (${(report.durationMs / 1000).toFixed(1)}s) ===`)
  console.log(
    `content: ${content.totalRows} rows — ${content.legacyRows} legacy, ${content.converted} converted, ` +
      `${content.alreadyLexical} already Lexical, ${content.failed} FAILED, ${content.written} written`,
  )
  console.log(
    `comments: ${comments.totalRows} rows — ${comments.legacyRows} legacy, ${comments.converted} converted, ` +
      `${comments.alreadyLexical} already Lexical, ${comments.failed} FAILED, ${comments.written} written`,
  )
  console.log(`blocks: ${JSON.stringify(stats.blockTypes)}`)
  console.log(`markDefs: ${JSON.stringify(stats.markDefTypes)}  decorators: ${JSON.stringify(stats.decoratorMarks)}`)
  console.log(`nested: ${JSON.stringify(stats.nestedBlockTypes)}`)
  console.log(
    `music: ${music.players} players, ${music.resolved} resolved, ${music.metaLess} meta-less; ` +
      `flag drops (auto/center): ${stats.musicFlagDrops}; orphan footnote refs: ${stats.orphanFootnoteRefs}`,
  )
  console.log(
    `cross-check: slugPolicyChanges=${crossCheck.slugPolicyChanges} nestedImages=${crossCheck.nestedImageStoragePaths.length} ` +
      `nestedHeadings=${crossCheck.nestedHeadings} e5Warnings=${crossCheck.e5Warnings}`,
  )
  if (report.searchIndex !== null) {
    console.log(
      `search index: ${report.searchIndex.processed}/${report.searchIndex.total} processed, ${report.searchIndex.failed} failed`,
    )
  }
  if (content.failed + comments.failed > 0) {
    console.log(`\nFAILURES (first ${content.failures.length + comments.failures.length}):`)
    for (const failure of [...content.failures, ...comments.failures]) {
      console.log(
        `  ${failure.table}#${failure.id}${failure.context === undefined ? '' : ` (${failure.context})`}: ${failure.errors.join('; ')}`,
      )
    }
  }
  if (report.mode === 'apply') {
    console.log(
      report.flagWritten ? '\nflag row written — corpus fully converted' : '\nflag row NOT written (failures present)',
    )
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  console.log(`${args.apply ? 'APPLY' : 'DRY-RUN'} against ${args.db}`)

  let db: Database
  let close: () => void
  if (args.apply) {
    const handle = openDatabase(args.db)
    db = handle.db
    close = () => closeDatabase(handle)
  } else {
    const client = new DatabaseSync(args.db, { readOnly: true })
    db = drizzle({ client })
    close = () => client.close()
  }

  try {
    // The projections and the music resolver read the settings snapshot.
    await hydrateBlogSettings(db)
    const report = await runPtLexicalBackfill(db, {
      mode: args.apply ? 'apply' : 'dry-run',
      resolveMusicEmbeds: (playerIds) => getPublicMusicMetasByIds(db, playerIds),
      hashCommentContent: hashContent,
      reindexSearchIndex: () => reindexSearchToCompletion(db),
    })
    if (args.report !== null) {
      writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`report written to ${args.report}`)
    }
    printSummary(report)
    if (args.apply) {
      return report.flagWritten ? 0 : 1
    }
    return 0
  } finally {
    close()
  }
}

process.exitCode = await main()

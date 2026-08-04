import type { PtMigrationSummary } from '@kobato/server/infra/pt-migration/migrate'

import { closeDatabase, openDatabase } from '@kobato/server/infra/db/database'
import { content } from '@kobato/server/infra/db/schema/content'
import { formatMigratePtSummary, parseMigratePtArgs } from '@kobato/server/infra/sea-cli'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// CLI-level tests for `kobato migrate-pt` (packages/server/src/infra/sea-cli).
//
// Two layers:
//   1. Pure-function tests — `parseMigratePtArgs` (argv → flags | usage
//      error) and `formatMigratePtSummary` (the stdout contract).
//   2. Process-level smoke — spawn a real `vite-node` run of `sea-cli.ts`
//      with `migrate-pt` args against a migrated temp SQLite file and
//      assert exit codes, stderr usage text, the stdout summary, and the
//      on-disk artifacts (backup + JSONL report). This closes the
//      doctor-probe-style process gap: the exit-code/usage/summary paths
//      of the CLI run only when the module evaluates with CLI argv, which
//      only ever happens inside the binary (or a subprocess like this).
//
// Importing sea-cli.ts in-process is safe: its module scope acts only when
// argv carries a CLI flag, and vitest's argv has none.

// --- subprocess harness -------------------------------------------------------

const require = createRequire(import.meta.url)
const REPO_ROOT = process.cwd()
const SEA_CLI_PATH = resolve(REPO_ROOT, 'packages/server/src/infra/sea-cli.ts')
// vite-node exposes its CLI under the `./cli` export (the dist file itself
// is not on the exports map).
const VITE_NODE_CLI = require.resolve('vite-node/cli')

// The sea-cli static graph reads the app-metadata globals at module scope
// (binary-rollback / self-update-gate → shared/config/version). The plain
// scripts vite-node config defines none of them, so the subprocess runs
// with its own temp config carrying the alias table (absolute paths) and
// the define table — the vite.sea.config.ts `define` values, applied to a
// vite-node evaluation instead of a bundle.
const CLI_CONFIG = `import { resolve } from 'node:path'
const root = ${JSON.stringify(REPO_ROOT)}
export default {
  resolve: {
    alias: {
      '@kobato/shared': resolve(root, 'packages/shared/src'),
      '@kobato/server': resolve(root, 'packages/server/src'),
      '@kobato/ui': resolve(root, 'packages/ui/src'),
      '@kobato/client': resolve(root, 'packages/client/src'),
      '@kobato/sdk': resolve(root, 'packages/sdk/src'),
    },
  },
  define: {
    __APP_NAME__: JSON.stringify('kobato'),
    __APP_VERSION__: JSON.stringify('0.0.0-cli-test'),
    __APP_DESCRIPTION__: JSON.stringify('cli smoke'),
    __APP_AUTHOR_NAME__: JSON.stringify('cli smoke'),
    __APP_HOMEPAGE__: JSON.stringify('https://example.test'),
    __APP_REPOSITORY__: JSON.stringify('https://example.test/repo'),
    __SEA_APP_VERSION__: JSON.stringify('0.0.0-cli-test'),
  },
}
`

const tempDirs: string[] = []
let cliConfigPath: string | null = null

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-cli-'))
  tempDirs.push(dir)
  return dir
}

function ensureCliConfig(): string {
  cliConfigPath ??= join(makeTempDir(), 'vite.node.config.mjs')
  if (!existsSync(cliConfigPath)) {
    writeFileSync(cliConfigPath, CLI_CONFIG)
  }
  return cliConfigPath
}

/** A migrated, file-backed SQLite database at a stable path (drizzle schema). */
function makeMigratedDb(): { path: string; dir: string } {
  const dir = makeTempDir()
  const handle = openDatabase(join(dir, 'test.db'))
  migrate(handle.db, { migrationsFolder: './drizzle', migrationsTable: '__drizzle_migrations' })
  return { path: handle.path, dir }
}

/** Seed one PT content row and close the handle (WAL folded) so the child can own the file. */
async function seedPtContent(dbPath: string, body: unknown): Promise<void> {
  const handle = openDatabase(dbPath)
  await handle.db.insert(content).values([{ type: 'post', ownerId: 1, revisionNo: 1, body }])
  closeDatabase(handle)
}

function runCli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env }
  delete env.VITEST
  const res = spawnSync(
    process.execPath,
    [VITE_NODE_CLI, '--config', ensureCliConfig(), SEA_CLI_PATH, 'migrate-pt', ...args],
    { cwd: REPO_ROOT, env, encoding: 'utf-8', timeout: 60_000 },
  )
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// --- fixtures (same shapes as the migrate it-tests) ---------------------------

const span = (key: string, text: string, marks?: string[]) => ({
  _type: 'span',
  _key: key,
  text,
  ...(marks ? { marks } : {}),
})
const block = (key: string, style: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  _type: 'block',
  _key: key,
  style,
  children,
  ...extra,
})

const ptBody = [
  block('h1', 'h2', [span('s1', '标题二')]),
  block('p1', 'normal', [span('s2', '正文 '), span('s3', '加粗', ['strong']), span('s4', ' 和链接 ')]),
  block('li1', 'normal', [span('s5', '第一层')], { listItem: 'bullet', level: 1 }),
].map((b, index) =>
  index === 1 ? { ...b, markDefs: [{ _type: 'link', _key: 'l1', href: 'https://example.com/x' }] } : b,
)

/** A PT content body whose footnoteRef points at a definition that does not exist — converts fine, fails the verify sanity assertions. */
const orphanFootnotePtBody = [
  block('p1', 'normal', [span('s1', '脚注引用', ['fn1'])], {
    markDefs: [{ _type: 'footnoteRef', _key: 'fn1', targetKey: 'ghost', index: 1 }],
  }),
]

// --- parseMigratePtArgs -------------------------------------------------------

describe('parseMigratePtArgs', () => {
  it('parses a full flag set', () => {
    const result = parseMigratePtArgs([
      '--db',
      '/tmp/db.sqlite',
      '--backup',
      '/tmp/backup.db',
      '--check',
      '--verify',
      '--report',
      '/tmp/report.jsonl',
    ])
    expect(result).toEqual({
      ok: true,
      flags: {
        db: '/tmp/db.sqlite',
        backup: '/tmp/backup.db',
        report: '/tmp/report.jsonl',
        check: true,
        verify: true,
      },
    })
  })

  it('treats a flag followed by another flag as valueless', () => {
    const result = parseMigratePtArgs(['--check', '--verify'])
    expect(result).toEqual({
      ok: true,
      flags: { db: undefined, backup: undefined, report: undefined, check: true, verify: true },
    })
  })

  it('ignores unknown flags and positional args (kept for the config graph)', () => {
    const result = parseMigratePtArgs(['migrate-pt', '--config', '/cfg.json', '--db', '/db.sqlite', '--check'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.flags.db).toBe('/db.sqlite')
      expect(result.flags.check).toBe(true)
    }
  })

  it('rejects a write without --backup', () => {
    expect(parseMigratePtArgs(['--db', '/tmp/db.sqlite'])).toEqual({
      ok: false,
      message: '--backup <path> is required unless --check is given',
    })
  })

  it('accepts --check without --backup', () => {
    const result = parseMigratePtArgs(['--check'])
    expect(result).toEqual({
      ok: true,
      flags: { db: undefined, backup: undefined, report: undefined, check: true, verify: false },
    })
  })

  it('accepts --check together with --backup (backup is ignored in check mode)', () => {
    const result = parseMigratePtArgs(['--check', '--backup', '/tmp/backup.db'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.flags.backup).toBe('/tmp/backup.db')
    }
  })
})

// --- formatMigratePtSummary ---------------------------------------------------

describe('formatMigratePtSummary', () => {
  const base: PtMigrationSummary = {
    dbPath: '/tmp/db.sqlite',
    checked: 3,
    migrated: 2,
    skipped: 1,
    failed: 1,
    verifyFailed: 1,
    verifyChecked: 3,
    spotRendered: 2,
    bytesBefore: 1000,
    bytesAfter: 900,
    errors: [{ kind: 'content', id: 3, error: 'invalid-json' }],
    verifyErrors: [
      { kind: 'content', id: 1, error: 'footnoteRef targetKey "ghost" has no footnoteDefinition in the body' },
    ],
    reportPath: '/tmp/report.jsonl',
    backupPath: '/tmp/backup.db',
  }

  it('prints the full summary (backup + verify lines)', () => {
    expect(formatMigratePtSummary(base)).toBe(
      [
        'PT → Lexical migration complete',
        '  database: /tmp/db.sqlite',
        '  checked: 3  migrated: 2  skipped (already lexical): 1  failed: 1',
        '  bytes: 1000 → 900',
        '  backup written to /tmp/backup.db',
        '  report: /tmp/report.jsonl',
        '  verify: rows=3 spot-rendered=2 failures=1',
        '',
      ].join('\n'),
    )
  })

  it('omits the backup and verify lines for a check-mode summary', () => {
    const checkSummary: PtMigrationSummary = {
      ...base,
      backupPath: undefined,
      checked: 1,
      migrated: 1,
      skipped: 0,
      failed: 0,
      verifyChecked: 0,
      spotRendered: 0,
      verifyFailed: 0,
      verifyErrors: [],
    }
    const text = formatMigratePtSummary(checkSummary)
    expect(text).toContain('checked: 1  migrated: 1  skipped (already lexical): 0  failed: 0')
    expect(text).not.toContain('backup written to')
    expect(text).not.toContain('verify:')
  })

  it('carries the verifyFailed count into the verify line', () => {
    const text = formatMigratePtSummary({ ...base, verifyChecked: 4, spotRendered: 3, verifyFailed: 2 })
    expect(text).toContain('verify: rows=4 spot-rendered=3 failures=2')
  })
})

// --- process-level smoke ------------------------------------------------------

describe('migrate-pt CLI (subprocess)', () => {
  it('exits 2 with the usage text when --backup is missing — even before the database is checked', () => {
    const { status, stdout, stderr } = runCli(['--db', join(makeTempDir(), 'missing.db')])
    expect(status).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toContain('--backup <path> is required unless --check is given')
    expect(stderr).toContain(
      'usage: kobato migrate-pt [--db <path>] [--backup <path>] [--check] [--verify] [--report <path>]',
    )
  })

  it('exits 2 when the database file is missing (--check given)', () => {
    const { status, stderr } = runCli(['--check', '--db', join(makeTempDir(), 'missing.db')])
    expect(status).toBe(2)
    expect(stderr).toContain('database not found:')
  })

  it('exits 0 in check mode, prints the summary and writes the report', { timeout: 30_000 }, async () => {
    const { path } = makeMigratedDb()
    await seedPtContent(path, ptBody)
    const dir = makeTempDir()
    const reportPath = join(dir, 'report.jsonl')

    const { status, stdout, stderr } = runCli(['--check', '--db', path, '--report', reportPath])

    expect(status).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('PT → Lexical migration complete')
    expect(stdout).toContain(`  database: ${path}`)
    expect(stdout).toContain('  checked: 1  migrated: 1  skipped (already lexical): 0  failed: 0')
    expect(stdout).toContain(`  report: ${reportPath}`)
    expect(stdout).not.toContain('backup written to')
    const report = readFileSync(reportPath, 'utf-8').trim()
    expect(JSON.parse(report)).toMatchObject({ kind: 'content', status: 'migrated' })
  })

  it('exits 1 on verify violations, prints the failure count, and writes the backup', { timeout: 30_000 }, async () => {
    const { path } = makeMigratedDb()
    await seedPtContent(path, orphanFootnotePtBody)
    const dir = makeTempDir()
    const backupPath = join(dir, 'backup.db')
    const reportPath = join(dir, 'report.jsonl')

    const { status, stdout, stderr } = runCli([
      '--db',
      path,
      '--backup',
      backupPath,
      '--verify',
      '--report',
      reportPath,
    ])

    expect(status).toBe(1)
    expect(stderr).toBe('')
    expect(stdout).toContain('  checked: 1  migrated: 1  skipped (already lexical): 0  failed: 0')
    expect(stdout).toContain(`  backup written to ${backupPath}`)
    expect(stdout).toContain('  verify: rows=1 spot-rendered=1 failures=1')
    expect(existsSync(backupPath)).toBe(true)
    const reportLines = readFileSync(reportPath, 'utf-8').trim().split('\n')
    expect(JSON.parse(reportLines[0]!)).toMatchObject({ kind: 'content', status: 'migrated' })
    expect(JSON.parse(reportLines[1]!)).toMatchObject({ kind: 'content', status: 'verify-failed' })
  })
})

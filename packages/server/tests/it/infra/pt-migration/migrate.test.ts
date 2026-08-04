import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { createTestDatabaseFile } from '#/_helpers/integration-db'

import { comment } from '@kobato/server/infra/db/schema/comment'
import { content } from '@kobato/server/infra/db/schema/content'
import {
  PtMigrationUsageError,
  resolvePtMigrationDbPath,
  runPtToLexicalMigration,
} from '@kobato/server/infra/pt-migration/migrate'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'

// Integration tests for `runPtToLexicalMigration` over real migrated
// temp-file databases (the drizzle content/comment tables). Covers the
// write path, the backup gate, `--check` read-only mode, the verify
// sanity assertions (verifyFailed accounting) and idempotence.

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
  block('p1', 'normal', [
    span('s2', '正文 '),
    span('s3', '加粗', ['strong']),
    span('s4', ' 和链接 ', []),
    span('s5', '超链接', ['l1']),
  ]),
  block('li1', 'normal', [span('s6', '第一层')], { listItem: 'bullet', level: 1 }),
  block('li2', 'normal', [span('s7', '第二层')], { listItem: 'bullet', level: 2 }),
].map((b, index) =>
  index === 1 ? { ...b, markDefs: [{ _type: 'link', _key: 'l1', href: 'https://example.com/x' }] } : b,
)

const ptComment = [
  block('c1', 'normal', [span('cs1', '评论'), span('cs2', '重点', ['strong'])]),
  block('c2', 'normal', [span('cs3', '第二段')]),
]

const lexicalBody = {
  root: {
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
    children: [
      {
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        textFormat: 0,
        textStyle: '',
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: '已是 Lexical', type: 'text', version: 1 }],
        version: 1,
      },
    ],
  },
}

/** A PT content body whose footnoteRef points at a definition that does not exist — converts fine, fails the verify sanity assertions. */
const orphanFootnotePtBody = [
  block('p1', 'normal', [span('s1', '脚注引用', ['fn1'])], {
    markDefs: [{ _type: 'footnoteRef', _key: 'fn1', targetKey: 'ghost', index: 1 }],
  }),
]

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-ptmig-'))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('runPtToLexicalMigration — write path', () => {
  it('migrates PT rows in one transaction, writes the backup and the JSONL report, and verifies', async () => {
    const handle = createTestDatabaseFile()
    const dir = makeTempDir()
    const backupPath = join(dir, 'backup.db')
    const reportPath = join(dir, 'report.jsonl')

    await handle.db.insert(content).values([
      { type: 'post', ownerId: 1, revisionNo: 1, body: ptBody },
      { type: 'post', ownerId: 1, revisionNo: 2, body: lexicalBody },
    ])
    // The corrupt row must be seeded via raw SQL — drizzle's json mode
    // would JSON-encode the string and the stored text would no longer
    // be the genuinely invalid JSON the migration must classify.
    handle.client
      .prepare(
        `INSERT INTO content (created_at, updated_at, type, owner_id, revision_no, body, image_sources, headings, client_revision_token)
         VALUES (1, 1, 'post', 1, 3, '{not json', '[]', '[]', 'tok')`,
      )
      .run()
    await handle.db
      .insert(comment)
      .values([{ type: 'post', ownerId: 1, userId: 1, body: unsafeCast<LexicalCommentBody>(ptComment) }])
    // Fold the WAL so the verbatim backup copy carries the seeded rows.
    handle.client.exec('PRAGMA wal_checkpoint(TRUNCATE)')

    const summary = await runPtToLexicalMigration({ dbPath: handle.path, backupPath, verify: true, reportPath })

    expect(summary).toMatchObject({
      dbPath: handle.path,
      checked: 4,
      migrated: 2,
      skipped: 1,
      failed: 1,
      verifyFailed: 0,
      verifyChecked: 3,
      spotRendered: 2,
      backupPath,
      reportPath,
      errors: [{ kind: 'content', id: 3, error: 'invalid-json' }],
      verifyErrors: [],
    })
    expect(summary.bytesBefore).toBeGreaterThan(0)
    expect(summary.bytesAfter).toBeGreaterThan(0)

    // Backup exists and carries the pre-migration rows.
    expect(existsSync(backupPath)).toBe(true)
    const backup = new DatabaseSync(backupPath)
    expect(Number((backup.prepare('SELECT COUNT(*) AS n FROM content').get() as { n: number }).n)).toBe(3)
    expect(Number((backup.prepare('SELECT COUNT(*) AS n FROM comment').get() as { n: number }).n)).toBe(1)
    backup.close()

    // The migrated rows are Lexical; the corrupt row is untouched
    // (read via the raw client — drizzle's json mode cannot decode it).
    const storedContent = handle.client.prepare('SELECT id, body FROM content ORDER BY id').all() as Array<{
      id: number
      body: unknown
    }>
    expect(storedContent).toHaveLength(3)
    expect(() => parseLexicalBody(JSON.parse(String(storedContent[0].body)) as unknown)).not.toThrow()
    expect(String(storedContent[1].body)).toBe(JSON.stringify(lexicalBody))
    expect(String(storedContent[2].body)).toBe('{not json')
    const storedComments = handle.client.prepare('SELECT body FROM comment').all() as Array<{ body: unknown }>
    expect(() => parseLexicalCommentBody(JSON.parse(String(storedComments[0].body)) as unknown)).not.toThrow()

    // The report holds one JSONL entry per row, migration statuses only.
    const reportLines = readFileSync(reportPath, 'utf-8').trim().split('\n')
    expect(reportLines).toHaveLength(4)
    const statuses = reportLines.map((line) => (JSON.parse(line) as { status: string }).status)
    expect(statuses).toEqual(expect.arrayContaining(['migrated', 'skipped-lexical', 'error']))
  })

  it('check mode never writes and needs no backup', async () => {
    const handle = createTestDatabaseFile()
    const dir = makeTempDir()
    await handle.db.insert(content).values([{ type: 'post', ownerId: 1, revisionNo: 1, body: ptBody }])

    const summary = await runPtToLexicalMigration({
      dbPath: handle.path,
      check: true,
      reportPath: join(dir, 'check.jsonl'),
    })

    expect(summary).toMatchObject({ checked: 1, migrated: 1, skipped: 0, failed: 0 })
    expect(summary.backupPath).toBeUndefined()
    // The row is still PT.
    const rows = await handle.db.select({ id: content.id, body: content.body }).from(content)
    expect(rows[0].body).toEqual(ptBody)
  })

  it('records verifyFailed rows in the report when sanity assertions fire', async () => {
    const handle = createTestDatabaseFile()
    const dir = makeTempDir()
    await handle.db.insert(content).values([{ type: 'post', ownerId: 1, revisionNo: 1, body: orphanFootnotePtBody }])

    const reportPath = join(dir, 'verify.jsonl')
    const summary = await runPtToLexicalMigration({
      dbPath: handle.path,
      backupPath: join(dir, 'backup.db'),
      verify: true,
      reportPath,
    })

    expect(summary.migrated).toBe(1)
    expect(summary.verifyFailed).toBe(1)
    expect(summary.verifyChecked).toBe(1)
    expect(summary.verifyErrors[0]).toMatchObject({ kind: 'content', id: 1 })
    expect(summary.verifyErrors[0].error).toContain('footnoteRef targetKey "ghost"')

    const reportLines = readFileSync(reportPath, 'utf-8').trim().split('\n')
    const verifyEntries = reportLines.map((line) => JSON.parse(line) as { status: string; error?: string })
    expect(verifyEntries.some((entry) => entry.status === 'verify-failed')).toBe(true)
    expect(verifyEntries.find((entry) => entry.status === 'verify-failed')?.error).toContain(
      'footnoteRef targetKey "ghost"',
    )
  })

  it('is idempotent: a re-run skips every converted row', async () => {
    const handle = createTestDatabaseFile()
    const dir = makeTempDir()
    await handle.db.insert(content).values([{ type: 'post', ownerId: 1, revisionNo: 1, body: ptBody }])
    await handle.db
      .insert(comment)
      .values([{ type: 'post', ownerId: 1, userId: 1, body: unsafeCast<LexicalCommentBody>(ptComment) }])

    const first = await runPtToLexicalMigration({
      dbPath: handle.path,
      backupPath: join(dir, 'a.db'),
      reportPath: join(dir, 'a.jsonl'),
    })
    expect(first.migrated).toBe(2)
    const second = await runPtToLexicalMigration({
      dbPath: handle.path,
      backupPath: join(dir, 'b.db'),
      reportPath: join(dir, 'b.jsonl'),
    })
    expect(second).toMatchObject({ checked: 2, migrated: 0, skipped: 2, failed: 0, verifyFailed: 0 })
  })

  it('rejects a write without a backup and a missing database file', async () => {
    const handle = createTestDatabaseFile()
    await expect(runPtToLexicalMigration({ dbPath: handle.path })).rejects.toBeInstanceOf(PtMigrationUsageError)
    await expect(
      runPtToLexicalMigration({ dbPath: join(makeTempDir(), 'missing.db'), backupPath: join(makeTempDir(), 'b.db') }),
    ).rejects.toThrow('database not found')
  })

  it('resolves the default database path from the config graph (dynamic import)', async () => {
    // The migration must run against the server's configured storage
    // when --db is omitted. Assert against the live config so the test
    // stays robust to the test environment's config state.
    const { serverConfig } = await import('@kobato/server/infra/config')
    const expected =
      serverConfig.storage.database === ''
        ? resolve(join(serverConfig.storage.data, 'kobato.db'))
        : serverConfig.storage.database
    expect(await resolvePtMigrationDbPath(undefined)).toBe(expected)
    // An explicit path wins without consulting the config.
    expect(await resolvePtMigrationDbPath('/tmp/explicit.db')).toBe('/tmp/explicit.db')
  })
})

import type { DatabaseHandle } from '@kobato/server/infra/db/database'

import { closeDatabase, openDatabase } from '@kobato/server/infra/db/database'
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'

// The `uq_webmention_pair` migration dedupes pre-existing rows BEFORE
// creating the unique index, grouping by the `normalizeForMatch`
// equality classes (fragment / default port / path trailing slashes
// fold; scheme and query stay distinct) and keeping the MAX(id) row per
// group. Exercised against a scratch database carrying the pre-migration
// table shape — the shared test DB is already fully migrated, so the
// cleanup branch can never run there.

const MIGRATION_SQL = readFileSync('drizzle/20260802111647_webmention_pair_unique/migration.sql', 'utf8')

const OLD_TABLE_SQL = `
CREATE TABLE \`webmention\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`source_url\` text NOT NULL,
	\`target_url\` text NOT NULL,
	\`status\` text DEFAULT 'pending' NOT NULL,
	\`target_type\` text NOT NULL,
	\`target_owner_id\` integer NOT NULL,
	\`fetched_at\` integer,
	\`author_name\` text,
	\`title\` text,
	\`summary\` text,
	\`raw_payload\` text NOT NULL,
	\`moderated_at\` integer,
	CONSTRAINT "webmention_status_chk" CHECK("status" IN ('pending', 'approved', 'rejected'))
);`

interface SeedRow {
  sourceUrl: string
  title: string
  createdAt?: number
}

function seed(handle: DatabaseHandle, rows: SeedRow[]): void {
  const now = Date.now()
  for (const row of rows) {
    handle.db.run(
      sql`INSERT INTO webmention (created_at, updated_at, source_url, target_url, status, target_type, target_owner_id, raw_payload, title)
          VALUES (${row.createdAt ?? now}, ${now}, ${row.sourceUrl}, 'https://example.com/posts/wm-target/', 'pending', 'post', 1, '{}', ${row.title})`,
    )
  }
}

function applyMigration(handle: DatabaseHandle): void {
  for (const statement of MIGRATION_SQL.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed !== '') {
      handle.db.run(sql.raw(trimmed))
    }
  }
}

async function surviving(handle: DatabaseHandle): Promise<{ id: number; sourceUrl: string; title: string }[]> {
  return handle.db.all<{ id: number; sourceUrl: string; title: string }>(
    sql`SELECT id, source_url AS sourceUrl, title FROM webmention ORDER BY id`,
  )
}

const handle = openDatabase(':memory:')
afterAll(() => closeDatabase(handle))

describe('migration / uq_webmention_pair — pre-index dedupe', () => {
  it('folds fragment / default-port / trailing-slash variants, keeping the latest row', async () => {
    handle.db.run(sql.raw(OLD_TABLE_SQL))
    seed(handle, [
      { sourceUrl: 'https://sender.example/post', title: 'oldest' },
      { sourceUrl: 'https://sender.example/post#comments', title: 'middle' },
      { sourceUrl: 'https://sender.example/post/', title: 'newest' },
      { sourceUrl: 'http://sender.example:80/post', title: 'http-scheme-stays' },
      { sourceUrl: 'https://sender.example:443/post', title: 'port-folds' },
      { sourceUrl: 'https://sender.example/post?utm_source=x', title: 'query-stays' },
      { sourceUrl: 'https://other.example/post', title: 'unrelated' },
    ])

    applyMigration(handle)

    const rows = await surviving(handle)
    // The four https://sender.example/post variants (base + fragment +
    // trailing slash + :443) collapse into one row; http, ?utm and the
    // unrelated source survive as their own groups.
    expect(rows.map((r) => r.title)).toEqual(['http-scheme-stays', 'port-folds', 'query-stays', 'unrelated'])

    // The unique index now exists.
    const indexes = handle.db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'webmention'`,
    )
    expect(indexes.map((i) => i.name)).toContain('uq_webmention_pair')
  })

  it('keeps the MAX(id) row even when an older id carries a later created_at (pinned approximation)', async () => {
    // The plan says "keep the latest createdAt"; the migration keeps
    // MAX(id) instead — ids autoincrement in insertion order and the app
    // never backdates created_at, so the two orders coincide on every
    // real row. This test pins the approximation DELIBERATELY: if the
    // dedupe ever switches to created_at ordering, it must change too.
    // (Separate scratch handle — the migration's CREATE INDEX is not
    // re-runnable on the shared one.)
    const scratch = openDatabase(':memory:')
    try {
      scratch.db.run(sql.raw(OLD_TABLE_SQL))
      const base = Date.now()
      seed(scratch, [
        { sourceUrl: 'https://sender.example/post', title: 'older-id-later-created', createdAt: base + 60_000 },
        { sourceUrl: 'https://sender.example/post/', title: 'max-id-survives', createdAt: base },
      ])

      applyMigration(scratch)

      const rows = await surviving(scratch)
      expect(rows.map((r) => r.title)).toEqual(['max-id-survives'])
    } finally {
      closeDatabase(scratch)
    }
  })
})

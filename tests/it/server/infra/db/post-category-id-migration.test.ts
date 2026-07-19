import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { sql } from 'drizzle-orm'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'

// Pins the SHIPPED backfill statement of the post_category_id migration:
// the it worker DB is fully migrated (the legacy `post.category` column
// no longer exists), so this test recreates the legacy shape itself and
// executes the exact `UPDATE … FROM "category"` read from the migration
// file on disk — never a paraphrase — against seeded legacy rows. This is
// also the statement the restore path runs: an old backup restores the
// legacy schema and the restore-completion `migrateDatabase()` applies
// this very file.

const MIGRATIONS_FOLDER = './drizzle'

function shippedBackfillStatement(): string {
  const dir = readdirSync(MIGRATIONS_FOLDER).find((entry) => entry.endsWith('_post_category_id'))
  if (dir === undefined) {
    throw new Error('post_category_id migration directory not found')
  }
  const file = readFileSync(join(MIGRATIONS_FOLDER, dir, 'migration.sql'), 'utf-8')
  const statement = file
    .split('--> statement-breakpoint')
    .find((chunk) => chunk.includes('UPDATE "post" SET "category_id"'))
  if (statement === undefined) {
    throw new Error('backfill UPDATE statement not found in the shipped migration')
  }
  return statement
}

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await db.execute(sql`ALTER TABLE "post" ADD COLUMN "category" varchar(20) NOT NULL DEFAULT ''`)
})

afterEach(async () => {
  await db.execute(sql`ALTER TABLE "post" DROP COLUMN IF EXISTS "category"`)
})

async function seedLegacyPost(slug: string, category: string): Promise<bigint> {
  const result = await db.execute(sql`
    INSERT INTO "post" ("created_at", "updated_at", "slug", "title", "category", "published_at")
    VALUES (now(), now(), ${slug}, 'T', ${category}, now())
    RETURNING "id"
  `)
  // Raw pg returns int8 as a string; the drizzle select below reads bigints.
  return BigInt((result.rows[0] as { id: string | number }).id)
}

describe('infra/db — post_category_id migration backfill (shipped SQL)', () => {
  it('maps matched names to ids, leaves unmatched names and the empty sentinel NULL', async () => {
    const [tech] = await db.insert(categoryTable).values({ name: 'Tech', slug: 'tech', cover: '' }).returning()
    const [life] = await db.insert(categoryTable).values({ name: 'Life', slug: 'life', cover: '' }).returning()
    const matchedA = await seedLegacyPost('matched-a', 'Tech')
    const matchedB = await seedLegacyPost('matched-b', 'Life')
    const unmatched = await seedLegacyPost('unmatched', 'Gone')
    const empty = await seedLegacyPost('empty', '')

    await db.execute(sql.raw(shippedBackfillStatement()))

    const rows = await db.select({ id: postMetaTable.id, categoryId: postMetaTable.categoryId }).from(postMetaTable)
    const byId = new Map(rows.map((row) => [row.id, row.categoryId]))
    expect(byId.get(matchedA)).toBe(tech.id)
    expect(byId.get(matchedB)).toBe(life.id)
    expect(byId.get(unmatched)).toBeNull()
    expect(byId.get(empty)).toBeNull()
  })
})

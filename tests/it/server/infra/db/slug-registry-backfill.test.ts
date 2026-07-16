import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { readFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { slugRegistry } from '@/server/infra/db/schema/config'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

/**
 * Execute the statements of the backfill migration exactly as the drizzle
 * migrator would: split on the statement breakpoint and run each chunk.
 */
async function runBackfillMigration() {
  const content = readFileSync('drizzle/20260716000000_backfill_slug_registry/migration.sql', 'utf8')
  const statements = content
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const statement of statements) {
    await pool.query(statement)
  }
}

describe('slug_registry backfill migration', () => {
  it('backfills pre-existing page and post slugs into the registry', async () => {
    // Insert directly, bypassing the registry write path — simulating content
    // that predates the registry.
    const [pageRow] = await db.insert(page).values({ slug: 'about', title: 'About' }).returning({ id: page.id })
    const [postRow] = await db.insert(post).values({ slug: 'hello', title: 'Hello' }).returning({ id: post.id })

    await runBackfillMigration()

    const rows = await db
      .select({ slug: slugRegistry.slug, entityType: slugRegistry.entityType, entityId: slugRegistry.entityId })
      .from(slugRegistry)

    expect(rows).toHaveLength(2)
    expect(rows).toContainEqual({ slug: 'about', entityType: 'page', entityId: pageRow!.id })
    expect(rows).toContainEqual({ slug: 'hello', entityType: 'post', entityId: postRow!.id })
  })

  it('is idempotent when executed a second time', async () => {
    await db.insert(page).values({ slug: 'about', title: 'About' })
    await db.insert(post).values({ slug: 'hello', title: 'Hello' })

    await runBackfillMigration()
    await runBackfillMigration()

    const rows = await db.select({ slug: slugRegistry.slug }).from(slugRegistry)
    expect(rows).toHaveLength(2)
  })
})

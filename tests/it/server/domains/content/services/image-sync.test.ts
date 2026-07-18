import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, describe, expect, it } from 'vitest'

import { createDbPool, closePool } from '@/server/infra/db/pool'

const imageSync = await import('@/server/domains/content/services/image-sync')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

describe('content/services/image-sync — syncLibraryImageBlocks', () => {
  it('no-ops on an empty body', async () => {
    await expect(imageSync.syncLibraryImageBlocks(db, [])).resolves.toBeUndefined()
  })

  it('no-ops on a body with no image blocks', async () => {
    const body = [{ _type: 'paragraph', children: [{ _type: 'text', text: 'hi' }] }] as never
    await expect(imageSync.syncLibraryImageBlocks(db, body)).resolves.toBeUndefined()
  })

  it('no-ops when imageId is undefined', async () => {
    const body = [{ _type: 'image', src: 'https://x/y.jpg', alt: '' }] as never
    await expect(imageSync.syncLibraryImageBlocks(db, body)).resolves.toBeUndefined()
  })
})

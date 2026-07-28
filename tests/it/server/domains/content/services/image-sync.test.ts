import { afterAll, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'

const imageSync = await import('@/server/domains/content/services/image-sync')

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
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

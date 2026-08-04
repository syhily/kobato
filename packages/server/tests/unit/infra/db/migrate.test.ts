import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrateMock = vi.fn()
const migrateSyncMock = vi.fn()

vi.mock('drizzle-orm/node-sqlite/migrator', () => ({
  migrate: migrateMock,
}))

vi.mock('drizzle-orm/sqlite-core/async/session', () => ({
  migrateSync: migrateSyncMock,
}))

vi.mock('@kobato/server/infra/sea', () => ({
  isSea: vi.fn(() => false),
  getEmbeddedAsset: vi.fn(() => null),
  listEmbeddedAssetKeys: vi.fn(() => []),
}))

const { isSea } = await import('@kobato/server/infra/sea')

describe('migrateDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSea).mockReturnValue(false)
  })

  it('runs the folder migrator outside SEA', async () => {
    const { migrateDatabase } = await import('@kobato/server/infra/db/migrate')
    const db = {} as never
    await migrateDatabase(db)

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: './drizzle',
      migrationsTable: '__drizzle_migrations',
    })
    expect(migrateSyncMock).not.toHaveBeenCalled()
  })

  it('runs the embedded migrator under SEA', async () => {
    vi.mocked(isSea).mockReturnValue(true)
    const { migrateDatabase } = await import('@kobato/server/infra/db/migrate')
    const db = { session: {} } as never
    await migrateDatabase(db)

    expect(migrateSyncMock).toHaveBeenCalled()
    expect(migrateMock).not.toHaveBeenCalled()
  })

  it('propagates migration failures', async () => {
    migrateMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const { migrateDatabase } = await import('@kobato/server/infra/db/migrate')
    await expect(migrateDatabase({} as never)).rejects.toThrow('boom')
  })
})

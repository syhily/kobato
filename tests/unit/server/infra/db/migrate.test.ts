import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrateMock = vi.fn()

vi.mock('drizzle-orm/node-sqlite/migrator', () => ({
  migrate: migrateMock,
}))

vi.mock('@/server/infra/sea', () => ({
  seaVfsRoot: vi.fn(() => null),
}))

const { seaVfsRoot } = await import('@/server/infra/sea')

describe('migrateDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(seaVfsRoot).mockReturnValue(null)
  })

  it('runs the folder migrator against ./drizzle outside SEA', async () => {
    const { migrateDatabase } = await import('@/server/infra/db/migrate')
    const db = {} as never
    await migrateDatabase(db)

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: './drizzle',
      migrationsTable: '__drizzle_migrations',
    })
  })

  it('points the same folder migrator at the mounted VFS under SEA', async () => {
    vi.mocked(seaVfsRoot).mockReturnValue('/dev/null/vfs/0')
    const { migrateDatabase } = await import('@/server/infra/db/migrate')
    const db = {} as never
    await migrateDatabase(db)

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: '/dev/null/vfs/0/drizzle',
      migrationsTable: '__drizzle_migrations',
    })
  })

  it('propagates migration failures', async () => {
    migrateMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const { migrateDatabase } = await import('@/server/infra/db/migrate')
    await expect(migrateDatabase({} as never)).rejects.toThrow('boom')
  })
})

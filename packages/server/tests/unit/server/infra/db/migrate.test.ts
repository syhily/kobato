import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrateMock = vi.fn()

vi.mock('drizzle-orm/node-sqlite/migrator', () => ({
  migrate: migrateMock,
}))

vi.mock('@kobato/server/infra/sea.ts', () => ({
  seaVfsRoot: vi.fn(() => null),
}))

const { seaVfsRoot } = await import('@kobato/server/infra/sea.ts')
const { defaultMigrationsFolder } = await import('@kobato/db/migrate.ts')

describe('migrateDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(seaVfsRoot).mockReturnValue(null)
  })

  it('runs the folder migrator against the db package migrations outside SEA', async () => {
    const { migrateDatabase } = await import('@kobato/server/infra/db/migrate.ts')
    const db = {} as never
    await migrateDatabase(db)

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: defaultMigrationsFolder(),
      migrationsTable: '__drizzle_migrations',
    })
  })

  it('points the same folder migrator at the mounted VFS under SEA', async () => {
    vi.mocked(seaVfsRoot).mockReturnValue('/dev/null/vfs/0')
    const { migrateDatabase } = await import('@kobato/server/infra/db/migrate.ts')
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
    const { migrateDatabase } = await import('@kobato/server/infra/db/migrate.ts')
    await expect(migrateDatabase({} as never)).rejects.toThrow('boom')
  })
})

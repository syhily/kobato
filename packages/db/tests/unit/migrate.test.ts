import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrateMock = vi.fn()

vi.mock('drizzle-orm/node-sqlite/migrator', () => ({
  migrate: migrateMock,
}))

const { defaultMigrationsFolder, MIGRATIONS_TABLE, migrateDatabase } = await import('@kobato/db/migrate')

describe('db migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the package-owned migration folder by default', () => {
    const db = {} as never
    migrateDatabase(db)

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: defaultMigrationsFolder(),
      migrationsTable: MIGRATIONS_TABLE,
    })
  })

  it('owns the migration lifecycle around a caller-provided adapter', () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    const db = {} as never
    migrateDatabase(db, { migrationsFolder: '/vfs/drizzle', embedded: true, logger })

    expect(migrateMock).toHaveBeenCalledWith(db, {
      migrationsFolder: '/vfs/drizzle',
      migrationsTable: MIGRATIONS_TABLE,
    })
    expect(logger.info).toHaveBeenNthCalledWith(1, 'Running database migrations', {
      migrationsFolder: '/vfs/drizzle',
      embedded: true,
    })
    expect(logger.info).toHaveBeenNthCalledWith(2, 'Database migrations completed')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs and propagates migration failures', () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    migrateMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    expect(() => migrateDatabase({} as never, { logger })).toThrow('boom')
    expect(logger.error).toHaveBeenCalledWith('Database migrations failed', { error: 'boom' })
  })
})

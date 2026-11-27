import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const migrateMock = vi.fn()
const drizzleMock = vi.fn((client: unknown) => ({ client }))

vi.mock('@duckdbfan/drizzle-duckdb', () => ({
  drizzle: drizzleMock,
  migrate: migrateMock,
}))

const { defaultAnalyticsMigrationsFolder, migrateAnalyticsDatabase } = await import('@kobato/db/duckdb/migrate')

describe('analytics migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves the DuckDB leaf below an embedded migrations root', () => {
    expect(defaultAnalyticsMigrationsFolder('/vfs/drizzle')).toBe('/vfs/drizzle/duckdb')
  })

  it('runs the writer connection through drizzle-duckdb', async () => {
    const writer = { run: vi.fn() }
    const handle = { writer } as unknown as AnalyticsHandle
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await migrateAnalyticsDatabase(handle, { migrationsRoot: '/vfs/drizzle', embedded: true, logger })

    expect(drizzleMock).toHaveBeenCalledWith(writer)
    expect(migrateMock).toHaveBeenCalledWith(
      { client: writer },
      {
        migrationsFolder: '/vfs/drizzle/duckdb',
        migrationsTable: '__drizzle_migrations',
      },
    )
    expect(logger.info).toHaveBeenNthCalledWith(1, 'Running analytics database migrations', {
      migrationsFolder: '/vfs/drizzle/duckdb',
      embedded: true,
    })
    expect(logger.info).toHaveBeenNthCalledWith(2, 'Analytics database migrations completed')
  })
})

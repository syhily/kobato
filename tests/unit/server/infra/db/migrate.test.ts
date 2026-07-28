import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeMock = vi.fn<() => Promise<unknown>>()
const endMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
const drizzleMock = vi.fn(() => ({
  $client: { end: endMock },
  execute: executeMock,
}))
const migrateMock = vi.fn<() => Promise<void>>()

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: Array.from(strings), values }),
}))

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: drizzleMock,
}))

vi.mock('drizzle-orm/node-postgres/migrator', () => ({
  migrate: migrateMock,
}))

vi.mock('@/server/infra/config', () => ({
  serverConfig: {
    server: {},
    database: { url: 'postgres://test:test@localhost:5432/test' },
    security: {},
    storage: {},
  },
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe('migrateDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeMock.mockResolvedValue(undefined)
    migrateMock.mockResolvedValue(undefined)
  })

  it('acquires advisory lock, runs migrations, releases lock, and ends client', async () => {
    const { migrateDatabase } = await import('@/server/infra/db/migrate')
    await migrateDatabase()

    expect(drizzleMock).toHaveBeenCalledWith({
      connection: {
        connectionString: 'postgres://test:test@localhost:5432/test',
        max: 1,
      },
    })
    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(migrateMock).toHaveBeenCalledTimes(1)
    expect(endMock).toHaveBeenCalledTimes(1)

    // First execute is lock, second is unlock.
    const calls = executeMock.mock.calls as unknown as Array<[{ strings: string[]; values: unknown[] }]>
    expect(calls[0][0].strings.join('')).toContain('pg_advisory_lock')
    expect(calls[1][0].strings.join('')).toContain('pg_advisory_unlock')
  })

  it('logs and rethrows migration errors, then releases the lock and ends client', async () => {
    const error = new Error('migration boom')
    migrateMock.mockRejectedValue(error)

    const { migrateDatabase } = await import('@/server/infra/db/migrate')
    await expect(migrateDatabase()).rejects.toThrow('migration boom')

    expect(migrateMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(endMock).toHaveBeenCalledTimes(1)
  })

  it('still ends client when lock release throws', async () => {
    executeMock.mockResolvedValueOnce(undefined)
    executeMock.mockRejectedValueOnce(new Error('unlock failed'))

    const { migrateDatabase } = await import('@/server/infra/db/migrate')
    await migrateDatabase()

    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(endMock).toHaveBeenCalledTimes(1)
  })
})

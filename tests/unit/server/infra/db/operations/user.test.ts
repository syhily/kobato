import { describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

// The SafeUser projections (`findSafeUserById` / `findSafeUserByEmail`)
// are the single owner of the "never leaves the server" field list:
// password, lastIp, lastUa. The projection is an explicit whitelist —
// a fourth sensitive column added to the `user` table cannot leak
// through it. These tests pin that contract through the select argument
// the functions hand to drizzle.

const SAFE_USER_COLUMNS = [
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'name',
  'email',
  'emailVerified',
  'link',
  'badgeName',
  'badgeColor',
  'badgeTextColor',
  'role',
  'isMuted',
  'receiveEmail',
  'loginMethod',
]

function createSelectCapture(rows: unknown[]) {
  const captured: { projections: Record<string, unknown>[] } = { projections: [] }
  const db = {
    select: vi.fn((projection: Record<string, unknown>) => {
      captured.projections.push(projection)
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(rows),
          }),
        }),
      }
    }),
  } as unknown as Database
  return { db, captured }
}

describe('infra/db/operations/user — SafeUser projections', () => {
  it('findSafeUserById selects exactly the SafeUser whitelist (no sensitive columns)', async () => {
    const { findSafeUserById } = await import('@/server/infra/db/operations/user')
    const { db, captured } = createSelectCapture([])
    await findSafeUserById(db, 1)
    const keys = Object.keys(captured.projections[0]!)
    expect(keys.sort()).toEqual([...SAFE_USER_COLUMNS].sort())
    expect(keys).not.toContain('password')
    expect(keys).not.toContain('lastIp')
    expect(keys).not.toContain('lastUa')
  })

  it('findSafeUserByEmail uses the identical whitelist (no drift between the two finders)', async () => {
    const { findSafeUserByEmail } = await import('@/server/infra/db/operations/user')
    const { db, captured } = createSelectCapture([])
    await findSafeUserByEmail(db, 'a@example.com')
    expect(Object.keys(captured.projections[0]!).sort()).toEqual([...SAFE_USER_COLUMNS].sort())
  })

  it('returns the row when found and null when missing', async () => {
    const { findSafeUserById } = await import('@/server/infra/db/operations/user')
    const row = { id: 1, name: 'Alice' }
    const found = createSelectCapture([row])
    expect(await findSafeUserById(found.db, 1)).toBe(row)
    const missing = createSelectCapture([])
    expect(await findSafeUserById(missing.db, 1)).toBeNull()
  })
})

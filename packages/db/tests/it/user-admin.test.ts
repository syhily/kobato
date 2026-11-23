import { sqliteOf } from '@kobato/db/sqlite/database'
import { hasAdmin, findFirstAdminUser } from '@kobato/db/sqlite/operations/identity/user'
import { user } from '@kobato/db/sqlite/schema/user'
import { clearAllTables, getTestDb } from '@kobato/db/tests/utils/integration-db'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('db/operations/user — hasAdmin', () => {
  it('returns false when there are no users', async () => {
    expect(await hasAdmin(db)).toBe(false)
  })

  it('returns false when the only admin is soft-deleted', async () => {
    await sqliteOf(db).insert(user).values({
      name: 'Deleted Admin',
      email: 'deleted@example.com',
      password: 'hashed',
      role: 'admin',
      deletedAt: new Date(),
    })

    expect(await hasAdmin(db)).toBe(false)
  })

  it('returns true when an active admin exists', async () => {
    await sqliteOf(db).insert(user).values({
      name: 'Active Admin',
      email: 'active@example.com',
      password: 'hashed',
      role: 'admin',
    })

    expect(await hasAdmin(db)).toBe(true)
  })

  it('returns true when at least one admin is active among mixed roles and deletions', async () => {
    await sqliteOf(db)
      .insert(user)
      .values([
        { name: 'Visitor', email: 'v@example.com', password: '', role: 'visitor' },
        { name: 'Deleted Admin', email: 'd@example.com', password: 'hashed', role: 'admin', deletedAt: new Date() },
        { name: 'Active Admin', email: 'a@example.com', password: 'hashed', role: 'admin' },
      ])

    expect(await hasAdmin(db)).toBe(true)
  })
})

describe('db/operations/user — findFirstAdminUser', () => {
  it('returns null when there are no users', async () => {
    expect(await findFirstAdminUser(db)).toBeNull()
  })

  it('returns null when the only admin is soft-deleted', async () => {
    await sqliteOf(db).insert(user).values({
      name: 'Deleted Admin',
      email: 'deleted@example.com',
      password: 'hashed',
      role: 'admin',
      deletedAt: new Date(),
    })

    expect(await findFirstAdminUser(db)).toBeNull()
  })

  it('returns the active admin when one exists', async () => {
    await sqliteOf(db).insert(user).values({
      name: 'Active Admin',
      email: 'active@example.com',
      password: 'hashed',
      role: 'admin',
    })

    const admin = await findFirstAdminUser(db)
    expect(admin).not.toBeNull()
    expect(admin!.name).toBe('Active Admin')
    expect(admin!.role).toBe('admin')
  })

  it('skips soft-deleted admins and returns the first active one', async () => {
    await sqliteOf(db)
      .insert(user)
      .values([
        { name: 'Deleted Admin', email: 'd1@example.com', password: 'hashed', role: 'admin', deletedAt: new Date() },
        { name: 'Active Admin', email: 'a@example.com', password: 'hashed', role: 'admin' },
        { name: 'Deleted Admin 2', email: 'd2@example.com', password: 'hashed', role: 'admin', deletedAt: new Date() },
      ])

    const admin = await findFirstAdminUser(db)
    expect(admin).not.toBeNull()
    expect(admin!.name).toBe('Active Admin')
  })
})

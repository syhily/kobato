import { beforeEach, describe, expect, it } from 'vitest'

import { hasAdmin, findFirstAdminUser } from '@/server/infra/db/operations/user'
import { db } from '@/server/infra/db/pool'
import { user } from '@/server/infra/db/schema/user'

beforeEach(async () => {
  await db.delete(user)
})

describe('db/operations/user — hasAdmin', () => {
  it('returns false when there are no users', async () => {
    expect(await hasAdmin()).toBe(false)
  })

  it('returns false when the only admin is soft-deleted', async () => {
    await db.insert(user).values({
      name: 'Deleted Admin',
      email: 'deleted@example.com',
      password: 'hashed',
      role: 'admin',
      deletedAt: new Date(),
    })

    expect(await hasAdmin()).toBe(false)
  })

  it('returns true when an active admin exists', async () => {
    await db.insert(user).values({
      name: 'Active Admin',
      email: 'active@example.com',
      password: 'hashed',
      role: 'admin',
    })

    expect(await hasAdmin()).toBe(true)
  })

  it('returns true when at least one admin is active among mixed roles and deletions', async () => {
    await db.insert(user).values([
      { name: 'Visitor', email: 'v@example.com', password: '', role: 'visitor' },
      { name: 'Deleted Admin', email: 'd@example.com', password: 'hashed', role: 'admin', deletedAt: new Date() },
      { name: 'Active Admin', email: 'a@example.com', password: 'hashed', role: 'admin' },
    ])

    expect(await hasAdmin()).toBe(true)
  })
})

describe('db/operations/user — findFirstAdminUser', () => {
  it('returns null when there are no users', async () => {
    expect(await findFirstAdminUser()).toBeNull()
  })

  it('returns null when the only admin is soft-deleted', async () => {
    await db.insert(user).values({
      name: 'Deleted Admin',
      email: 'deleted@example.com',
      password: 'hashed',
      role: 'admin',
      deletedAt: new Date(),
    })

    expect(await findFirstAdminUser()).toBeNull()
  })

  it('returns the active admin when one exists', async () => {
    await db.insert(user).values({
      name: 'Active Admin',
      email: 'active@example.com',
      password: 'hashed',
      role: 'admin',
    })

    const admin = await findFirstAdminUser()
    expect(admin).not.toBeNull()
    expect(admin!.name).toBe('Active Admin')
    expect(admin!.role).toBe('admin')
  })

  it('skips soft-deleted admins and returns the first active one', async () => {
    await db.insert(user).values([
      { name: 'Deleted Admin', email: 'd1@example.com', password: 'hashed', role: 'admin', deletedAt: new Date() },
      { name: 'Active Admin', email: 'a@example.com', password: 'hashed', role: 'admin' },
      { name: 'Deleted Admin 2', email: 'd2@example.com', password: 'hashed', role: 'admin', deletedAt: new Date() },
    ])

    const admin = await findFirstAdminUser()
    expect(admin).not.toBeNull()
    expect(admin!.name).toBe('Active Admin')
  })
})

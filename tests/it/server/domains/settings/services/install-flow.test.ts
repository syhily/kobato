import { asc } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { setting } from '@/server/infra/db/schema/config'
import { DomainError } from '@/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

const INPUT = { title: 'My Blog', name: 'Admin', email: 'admin@example.com', hostname: 'localhost' }

function builtRows() {
  const result = buildInstallSectionRows(INPUT)
  if (!result.ok) {
    throw new Error(`expected ok rows, got: ${result.message}`)
  }
  return result.rows
}

describe('server/domains/settings/services/install-flow', () => {
  describe('buildInstallSectionRows', () => {
    it('builds validated rows for all 18 sections — general and assets first, the rest in registry order', () => {
      const rows = builtRows()

      expect(rows).toHaveLength(18)
      expect(rows[0]?.scope).toBe('blog.general')
      expect(rows[1]?.scope).toBe('blog.assets')
      const remainingScopes = SETTINGS_SECTIONS.filter((section) => section !== 'general' && section !== 'assets').map(
        (section) => SECTION_REGISTRY[section].scope,
      )
      expect(rows.slice(2).map((row) => row.scope)).toEqual(remainingScopes)
    })

    it('carries the install identity into blog.general', () => {
      const general = builtRows()[0]?.payload

      expect(general?.title).toBe('My Blog')
      expect(general?.website).toBe('https://localhost')
      expect(general?.author).toMatchObject({ name: 'Admin', email: 'admin@example.com', url: 'https://localhost' })
      expect(general?.locale).toBe('zh-CN')
    })

    it('seeds blog.assets with the request host and the storage upload toggle off', () => {
      const assets = builtRows()[1]?.payload

      expect(assets?.asset).toEqual({ host: 'localhost', scheme: 'https' })
      const storage = assets?.storage as { enabled: boolean }
      expect(storage.enabled).toBe(false)
    })

    it('fails softly with the section scope and issue path when a form-derived section is invalid', () => {
      const result = buildInstallSectionRows({ ...INPUT, title: '' })

      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.message).toContain('blog.general 校验失败（title）')
    })

    it('rethrows the shared DomainError when a registry default drifted from its schema', () => {
      // A corrupt seed is a build bug: `buildDefaultSectionPayloads`
      // throws — the identical message the hydration backfill surfaces —
      // instead of collapsing into the soft form-error path.
      const mutableRegistry = SECTION_REGISTRY as unknown as Record<string, { defaults: unknown }>
      const original = SECTION_REGISTRY.limits
      mutableRegistry.limits = { ...original, defaults: { maxRequestBodySize: 'ten' } }
      try {
        expect(() => buildInstallSectionRows(INPUT)).toThrowError(DomainError)
        expect(() => buildInstallSectionRows(INPUT)).toThrowError(
          'blog.limits defaults invalid at `maxRequestBodySize`: Invalid input: expected number, received NaN',
        )
      } finally {
        mutableRegistry.limits = original
      }
    })
  })

  describe('seedInstallSections', () => {
    it('persists every row inside the caller-supplied transaction, in order', async () => {
      // The handle IS the atomicity contract: the install flow passes its
      // admin-insert transaction, so every upsert must go through it.
      const rows = builtRows()

      db.transaction((tx) => {
        seedInstallSections(tx, rows, 7)
      })

      const stored = await db.select().from(setting).orderBy(asc(setting.id))
      expect(stored).toHaveLength(18)
      expect(stored.map((row) => row.scope)).toEqual(rows.map((row) => row.scope))
      for (const [index, row] of stored.entries()) {
        expect(row.data).toEqual(rows[index]?.payload)
        expect(row.updatedBy).toBe(7)
      }
    })

    it('propagates a persist failure so the caller transaction rolls back', async () => {
      // A payload the JSON column cannot serialize fails the INSERT for
      // real — the same propagation the admin-insert transaction relies
      // on. The two rows seeded before it must roll back with it.
      const circular: Record<string, unknown> = {}
      circular.self = circular
      const rows = [...builtRows().slice(0, 2), { scope: 'blog.mail', payload: circular }]

      expect(() =>
        db.transaction((tx) => {
          seedInstallSections(tx, rows, null)
        }),
      ).toThrow()

      expect(await db.select().from(setting)).toHaveLength(0)
    })
  })
})

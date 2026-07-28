import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { DomainError } from '@/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

vi.mock('@/server/infra/db/operations/setting', () => ({
  upsertSetting: vi.fn(async () => undefined),
}))

const settingQuery = await import('@/server/infra/db/operations/setting')

const INPUT = { title: 'My Blog', name: 'Admin', email: 'admin@example.com', hostname: 'localhost' }

function builtRows() {
  const result = buildInstallSectionRows(INPUT)
  if (!result.ok) {
    throw new Error(`expected ok rows, got: ${result.message}`)
  }
  return result.rows
}

describe('server/domains/settings/services/install-flow', () => {
  beforeEach(() => {
    vi.mocked(settingQuery.upsertSetting).mockClear()
  })

  describe('buildInstallSectionRows', () => {
    it('builds validated rows for all 17 sections — general and assets first, the rest in registry order', () => {
      const rows = builtRows()

      expect(rows).toHaveLength(17)
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
      expect((assets?.storage as { enabled: boolean }).enabled).toBe(false)
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
    it('upserts every row through the caller-supplied handle, in order', async () => {
      // The handle IS the atomicity contract: the install flow passes its
      // admin-insert transaction, so every upsert must go through it.
      const tx = { marker: 'admin-insert-tx' } as unknown as Database
      const rows = builtRows()

      await seedInstallSections(tx, rows, 7)

      const calls = vi.mocked(settingQuery.upsertSetting).mock.calls
      expect(calls).toHaveLength(17)
      for (const [index, [handle, payload, updatedBy, scope]] of calls.entries()) {
        expect(handle).toBe(tx)
        expect(payload).toBe(rows[index]?.payload)
        expect(updatedBy).toBe(7)
        expect(scope).toBe(rows[index]?.scope)
      }
    })

    it('propagates a persist failure so the caller transaction rolls back', async () => {
      vi.mocked(settingQuery.upsertSetting).mockImplementationOnce(() => {
        throw new Error('connection lost')
      })

      expect(() =>
        seedInstallSections({} as unknown as Database, [{ scope: 'blog.general', payload: {} }], null),
      ).toThrow('connection lost')
    })
  })
})

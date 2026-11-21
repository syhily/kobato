import {
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  validateSectionDefaults,
} from '@kobato/server/domains/settings/sections/registry'
import { SETTINGS_SECTIONS } from '@kobato/settings/sections'
import { describe, expect, it } from 'vitest'

const CORRUPT_LIMITS_MESSAGE =
  'blog.limits defaults invalid at `maxRequestBodySize`: Invalid input: expected number, received NaN'

function thrownMessage(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('Expected the function to throw')
}

describe('server/domains/settings/sections/registry', () => {
  it('builds parsed default payloads for exactly the sections that ship defaults', () => {
    const payloads = buildDefaultSectionPayloads()
    const seeded = SETTINGS_SECTIONS.filter((section) => SECTION_REGISTRY[section].defaults !== null)

    expect(payloads.map(({ section }) => section)).toEqual(seeded)
    expect(payloads.some(({ section }) => section === 'general')).toBe(false)
    expect(payloads.some(({ section }) => section === 'assets')).toBe(false)
  })

  it('rejects a corrupt section default through the same validator on both paths', () => {
    const mutableRegistry = SECTION_REGISTRY as unknown as Record<string, { defaults: unknown }>
    const original = SECTION_REGISTRY.limits
    mutableRegistry.limits = { ...original, defaults: { maxRequestBodySize: 'ten' } }
    try {
      const fromBuilder = thrownMessage(() => buildDefaultSectionPayloads())
      const fromValidator = thrownMessage(() =>
        validateSectionDefaults({ ...original, defaults: { maxRequestBodySize: 'ten' } }),
      )

      expect(fromBuilder).toBe(fromValidator)
      expect(fromBuilder).toBe(CORRUPT_LIMITS_MESSAGE)
    } finally {
      mutableRegistry.limits = original
    }
  })
})

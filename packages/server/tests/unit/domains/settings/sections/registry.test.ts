import {
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  validateSectionDefaults,
} from '@kobato/server/domains/settings/sections/registry'
import { SETTINGS_SECTIONS } from '@kobato/shared/config/sections'
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
    // general / assets ship no seed — their setup-time first write must
    // arrive complete.
    expect(payloads.some(({ section }) => section === 'general')).toBe(false)
    expect(payloads.some(({ section }) => section === 'assets')).toBe(false)
  })

  it('rejects a corrupt section default through the same validator on both paths', () => {
    // Corrupt one section's seed in a registry double: the backfill
    // builder and the validator the write path's merge base calls must
    // reject with the identical message.
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

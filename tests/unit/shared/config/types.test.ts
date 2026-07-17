import { describe, expect, it } from 'vitest'

import type { SettingsSectionPatch } from '@/shared/config/types'

describe('SettingsSectionPatch', () => {
  it('keeps search fields nested under the persisted search bucket', () => {
    const patch: SettingsSectionPatch<'search'> = { search: { trgmThreshold: 0.8 } }

    // @ts-expect-error Search fields at the payload root are discarded by the server schema.
    const invalidPatch: SettingsSectionPatch<'search'> = { trgmThreshold: 0.8 }

    expect(patch).toEqual({ search: { trgmThreshold: 0.8 } })
    expect(invalidPatch).toEqual({ trgmThreshold: 0.8 })
  })
})

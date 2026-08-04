import type { SettingsSectionPatch } from '@kobato/shared/config/types'

import { describe, expect, it } from 'vitest'

describe('SettingsSectionPatch', () => {
  it('keeps analytics fields nested under the persisted analytics bucket', () => {
    const patch: SettingsSectionPatch<'analytics'> = { analytics: { trackAdmin: true } }

    // @ts-expect-error Section fields at the payload root are discarded by the server schema.
    const invalidPatch: SettingsSectionPatch<'analytics'> = { trackAdmin: true }

    expect(patch).toEqual({ analytics: { trackAdmin: true } })
    expect(invalidPatch).toEqual({ trackAdmin: true })
  })
})

import { createRumIntakeProxyUrl } from '@kobato/api/client/rum-intake'
import { RUM_INTAKE_PATH } from '@kobato/api/contracts/public/observability'
import { describe, expect, it } from 'vitest'

describe('RUM intake transport contract', () => {
  it('pins the external relay path and composes the SDK proxy URL', () => {
    expect(RUM_INTAKE_PATH).toBe('/api/rum/intake')
    expect(
      createRumIntakeProxyUrl({ origin: 'https://blog.example', path: '/rum/v1/site/rum', parameters: 'a=1' }),
    ).toBe('https://blog.example/api/rum/intake/rum/v1/site/rum?a=1')
    expect(createRumIntakeProxyUrl({ origin: null, path: '/rum/v1/site/rum', parameters: 'a=1' })).toBe(
      '/api/rum/intake/rum/v1/site/rum?a=1',
    )
  })
})

import { ACCEPT_CH_HEADER } from '@kobato/server/http/middleware-pipeline'
import { describe, expect, it } from 'vitest'

describe('Accept-CH opt-in', () => {
  it('requests the full client-hint set', () => {
    const requested = ACCEPT_CH_HEADER.split(',').map((hint) => hint.trim())

    expect(new Set(requested)).toEqual(
      new Set([
        'Sec-CH-UA',
        'Sec-CH-UA-Mobile',
        'Sec-CH-UA-Platform',
        'Sec-CH-UA-Platform-Version',
        'Sec-CH-UA-Model',
        'Sec-CH-UA-Full-Version',
        'Sec-CH-UA-Full-Version-List',
        'Sec-CH-UA-Arch',
        'Sec-CH-UA-Bitness',
        'Sec-CH-UA-Form-Factors',
      ]),
    )
    expect(requested).toHaveLength(10)
  })
})

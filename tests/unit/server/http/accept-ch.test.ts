import { describe, expect, it } from 'vitest'

import { ACCEPT_CH_HEADER } from '@/server/http/middleware-pipeline'

// The response opt-in must cover every hint `device_env_server` persists —
// a hint the browser never sends would leave the column permanently ''.

describe('Accept-CH opt-in', () => {
  it('requests the full ADR-0006 client-hint set', () => {
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

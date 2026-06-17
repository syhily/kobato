import { describe, expect, it } from 'vitest'

import { loader } from '@/routes/public/not-found'

describe('route: public/not-found', () => {
  describe('loader', () => {
    it('throws a 404 response', () => {
      expect(() => loader({ request: new Request('https://example.com/missing') } as never)).toThrow()
    })
  })
})

import { loader } from '@sayaka/routes/not-found'
import { describe, expect, it } from 'vitest'

describe('route: public/not-found', () => {
  describe('loader', () => {
    it('throws a 404 response', () => {
      expect(() => loader({ request: new Request('https://example.com/missing') } as never)).toThrow()
    })
  })
})

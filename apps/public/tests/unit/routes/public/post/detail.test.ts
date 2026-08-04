import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/public/post/detail'

describe('route: public/post/detail', () => {
  describe('meta', () => {
    it('falls back to base meta when loaderData is missing', () => {
      const result = meta({ loaderData: undefined, matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '且听书吟 - 诗与梦想的远方' })
    })

    it('emits post seo meta when loaderData is present', () => {
      const post = {
        title: 'Hello Post',
        slug: 'hello-post',
        summary: 'A test post',
        permalink: '/posts/hello-post',
        date: '2024-01-01T00:00:00.000Z',
        category: 'general',
        tags: ['test'],
      }
      const result = meta({ loaderData: { post }, matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: 'Hello Post - 且听书吟' })
    })
  })
})

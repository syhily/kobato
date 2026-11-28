import { z } from 'zod'

export const webmentionsSchema = z.object({
  webmention: z.object({
    receiveEnabled: z.boolean(),
    displayOnPosts: z.boolean(),
  }),
})

export const webmentionsDefaults = {
  webmention: {
    receiveEnabled: true,
    displayOnPosts: true,
  },
} as const

export const webmentionsSection = {
  scope: 'blog.webmentions',
  key: 'webmentions',
  schema: webmentionsSchema,
  defaults: webmentionsDefaults,
} as const

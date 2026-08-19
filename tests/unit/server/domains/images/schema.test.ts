import { describe, expect, it } from 'vitest'

import { uploadImageMetadataSchema } from '@/server/domains/images/schema'

describe('server/domains/images/schema — uploadImageMetadataSchema', () => {
  it('accepts a generic kind', () => {
    expect(uploadImageMetadataSchema.safeParse({ kind: 'generic' }).success).toBe(true)
  })

  it('accepts a category kind with slug', () => {
    expect(uploadImageMetadataSchema.safeParse({ kind: 'category', slug: 'tech' }).success).toBe(true)
  })

  it('rejects a category kind without slug', () => {
    expect(uploadImageMetadataSchema.safeParse({ kind: 'category' }).success).toBe(false)
  })

  it('accepts a friend kind with host', () => {
    expect(uploadImageMetadataSchema.safeParse({ kind: 'friend', host: 'example.com' }).success).toBe(true)
  })

  it('rejects a friend kind without host', () => {
    expect(uploadImageMetadataSchema.safeParse({ kind: 'friend' }).success).toBe(false)
  })

  it('rejects an unknown kind', () => {
    expect(uploadImageMetadataSchema.safeParse({ kind: 'wallpaper' }).success).toBe(false)
  })
})

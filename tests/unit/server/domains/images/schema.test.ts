import { describe, expect, it } from 'vitest'

import {
  deleteImageSchema,
  listImagesSchema,
  recalculateThumbhashSchema,
  updateImageNoteSchema,
  uploadImageMetadataSchema,
} from '@/server/domains/images/schema'

describe('server/domains/images/schema — listImagesSchema', () => {
  it('accepts an empty payload', () => {
    expect(listImagesSchema.safeParse({}).success).toBe(true)
  })

  it('coerces offset/limit from strings', () => {
    const result = listImagesSchema.safeParse({ offset: '5', limit: '20' })
    expect(result.success).toBe(true)
    expect(result.data?.offset).toBe(5)
    expect(result.data?.limit).toBe(20)
  })

  it('rejects limit above 200', () => {
    expect(listImagesSchema.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('rejects an unknown kind enum', () => {
    expect(listImagesSchema.safeParse({ kind: 'wallpaper' }).success).toBe(false)
  })
})

describe('server/domains/images/schema — deleteImageSchema', () => {
  it('accepts a non-empty id', () => {
    expect(deleteImageSchema.safeParse({ id: '1' }).success).toBe(true)
  })
  it('rejects an empty id', () => {
    expect(deleteImageSchema.safeParse({ id: '' }).success).toBe(false)
  })
})

describe('server/domains/images/schema — recalculateThumbhashSchema', () => {
  it('accepts a non-empty id', () => {
    expect(recalculateThumbhashSchema.safeParse({ id: '1' }).success).toBe(true)
  })
})

describe('server/domains/images/schema — updateImageNoteSchema', () => {
  it('normalises an empty-string note to null', () => {
    const result = updateImageNoteSchema.safeParse({ id: '1', note: '' })
    expect(result.success).toBe(true)
    expect(result.data?.note).toBeNull()
  })

  it('trims and keeps a non-empty note', () => {
    const result = updateImageNoteSchema.safeParse({ id: '1', note: '  hello  ' })
    expect(result.data?.note).toBe('hello')
  })

  it('treats explicit null as null', () => {
    const result = updateImageNoteSchema.safeParse({ id: '1', note: null })
    expect(result.data?.note).toBeNull()
  })
})

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

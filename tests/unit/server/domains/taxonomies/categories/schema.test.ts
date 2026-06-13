import { describe, expect, it } from 'vitest'

import {
  categoryIdSchema,
  listCategoriesSchema,
  reorderCategoriesSchema,
  upsertCategorySchema,
} from '@/server/domains/taxonomies/categories/schema'

describe('server/domains/taxonomies/categories/schema — listCategoriesSchema', () => {
  it('accepts an empty payload', () => {
    expect(listCategoriesSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a query string', () => {
    expect(listCategoriesSchema.safeParse({ q: 'tech' }).success).toBe(true)
  })

  it('rejects a query string longer than 100', () => {
    expect(listCategoriesSchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('server/domains/taxonomies/categories/schema — categoryIdSchema', () => {
  it('accepts a non-empty id', () => {
    expect(categoryIdSchema.safeParse({ id: '1' }).success).toBe(true)
  })
  it('rejects an empty id', () => {
    expect(categoryIdSchema.safeParse({ id: '' }).success).toBe(false)
  })
})

describe('server/domains/taxonomies/categories/schema — upsertCategorySchema', () => {
  const valid = {
    name: 'Tech',
    cover: 'https://example.com/cover.png',
  }

  it('accepts a minimal create payload and defaults sortOrder to 0', () => {
    const result = upsertCategorySchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data?.sortOrder).toBe(0)
    expect(result.data?.description).toBe('')
  })

  it('accepts a slug that matches the kebab-case pattern', () => {
    expect(upsertCategorySchema.safeParse({ ...valid, slug: 'my-slug-123' }).success).toBe(true)
  })

  it('rejects a slug with underscores or spaces', () => {
    expect(upsertCategorySchema.safeParse({ ...valid, slug: 'under_score' }).success).toBe(false)
    expect(upsertCategorySchema.safeParse({ ...valid, slug: 'with space' }).success).toBe(false)
  })

  it('accepts an id for update', () => {
    expect(upsertCategorySchema.safeParse({ ...valid, id: '5' }).success).toBe(true)
  })

  it('rejects a name longer than 20 chars', () => {
    expect(upsertCategorySchema.safeParse({ ...valid, name: 'x'.repeat(21) }).success).toBe(false)
  })

  it('rejects an invalid cover URL', () => {
    expect(upsertCategorySchema.safeParse({ ...valid, cover: 'not-a-url' }).success).toBe(false)
  })

  it('rejects sortOrder above 9999', () => {
    expect(upsertCategorySchema.safeParse({ ...valid, sortOrder: 10000 }).success).toBe(false)
  })
})

describe('server/domains/taxonomies/categories/schema — reorderCategoriesSchema', () => {
  it('accepts a list with at least one id', () => {
    expect(reorderCategoriesSchema.safeParse({ orderedIds: ['1', '2', '3'] }).success).toBe(true)
  })

  it('rejects an empty list', () => {
    expect(reorderCategoriesSchema.safeParse({ orderedIds: [] }).success).toBe(false)
  })

  it('rejects more than 500 ids', () => {
    expect(reorderCategoriesSchema.safeParse({ orderedIds: Array.from({ length: 501 }, () => '1') }).success).toBe(
      false,
    )
  })

  it('rejects an id with empty string', () => {
    expect(reorderCategoriesSchema.safeParse({ orderedIds: [''] }).success).toBe(false)
  })
})

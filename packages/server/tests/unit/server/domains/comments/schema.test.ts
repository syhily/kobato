import { filterAutocompleteSchema, loadAllCommentsSchema } from '@kobato/server/domains/comments/schema.ts'
import { describe, expect, it } from 'vitest'

describe('loadAllCommentsSchema', () => {
  it('accepts required fields only', async () => {
    const data = await loadAllCommentsSchema.parseAsync({ offset: 0, limit: 20 })
    expect(data).toEqual({ offset: 0, limit: 20 })
  })

  it('accepts all optional filters', async () => {
    const data = await loadAllCommentsSchema.parseAsync({
      offset: 0,
      limit: 50,
      pageKey: '/about',
      userId: 'u1',
      status: 'approved',
      q: 'hello',
      match: 'contains',
      createdAfter: '2024-01-01T00:00:00.000Z',
      createdBefore: '2024-12-31T23:59:59.000Z',
    })
    expect(data).toMatchObject({ status: 'approved', q: 'hello', match: 'contains' })
  })

  it('rejects an invalid status enum', async () => {
    await expect(loadAllCommentsSchema.parseAsync({ offset: 0, limit: 10, status: 'banned' })).rejects.toBeTruthy()
  })

  it('rejects a q string that is too long', async () => {
    await expect(loadAllCommentsSchema.parseAsync({ offset: 0, limit: 10, q: 'x'.repeat(201) })).rejects.toBeTruthy()
  })
})

describe('filterAutocompleteSchema', () => {
  it('splits ids on commas and trims whitespace', async () => {
    const data = await filterAutocompleteSchema.parseAsync({ ids: ' 1 , 2 ,3 ' })
    expect(data.ids).toEqual(['1', '2', '3'])
  })

  it('defaults limit to 20', async () => {
    const data = await filterAutocompleteSchema.parseAsync({})
    expect(data.limit).toBe(20)
  })

  it('keeps the key field', async () => {
    const data = await filterAutocompleteSchema.parseAsync({ key: 'https://example.com/about/' })
    expect(data.key).toBe('https://example.com/about/')
  })
})

import { filterAutocompleteSchema } from '@kobato/server/domains/comments/schema'
import { describe, expect, it } from 'vitest'

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

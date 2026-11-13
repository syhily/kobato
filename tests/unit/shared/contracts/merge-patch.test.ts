import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { clearable, mergePatchInput, splitMergePatch } from '@/shared/contracts/merge-patch'
import { optionalHttpUrlSchema } from '@/shared/utils/safe-url'

// The merge-patch input contract every field-update procedure builds on:
// the identity key is required and never updatable; per patch field, absent
// = untouched, null = clear, value = set.
const input = mergePatchInput({
  name: z.string().min(1).optional(),
  link: clearable(optionalHttpUrlSchema),
})

describe('mergePatchInput', () => {
  it('requires the identity key', () => {
    expect(input.safeParse({ name: 'Alice' }).success).toBe(false)
    expect(input.safeParse({ id: '' }).success).toBe(false)
    expect(input.safeParse({ id: 'abc' }).success).toBe(false)
    expect(input.safeParse({ id: '42' }).success).toBe(true)
  })

  it('rejects a patch shape that declares the identity key', () => {
    expect(() => mergePatchInput({ id: z.string() })).toThrow(/identity key/)
  })
})

describe('clearable', () => {
  it('accepts a value, null, and an absent key', () => {
    expect(input.parse({ id: '1', link: 'https://example.com' }).link).toBe('https://example.com')
    expect(input.parse({ id: '1', link: null }).link).toBeNull()
    expect('link' in input.parse({ id: '1' })).toBe(false)
  })

  it('still enforces the inner schema on values', () => {
    expect(input.safeParse({ id: '1', link: 'javascript:alert(1)' }).success).toBe(false)
  })
})

describe('splitMergePatch', () => {
  it('separates the identity id from the patch', () => {
    const { id, patch } = splitMergePatch(input.parse({ id: '7', name: 'Alice' }))
    expect(id).toBe('7')
    expect(patch).toEqual({ name: 'Alice' })
    expect('id' in patch).toBe(false)
  })

  it('drops absent keys but keeps explicit null so it clears the column', () => {
    const { patch } = splitMergePatch(input.parse({ id: '7', link: null }))
    expect(patch).toEqual({ link: null })
    expect('name' in patch).toBe(false)
  })
})

import { registerCardDecorate } from '@kobato/inkling-internal/nodes/card-decorate-slot'
import { registerCardDecorateAdapter } from '@kobato/inkling-internal/nodes/decorate-card'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/inkling-internal/nodes/card-decorate-slot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/inkling-internal/nodes/card-decorate-slot')>()
  return { ...actual, registerCardDecorate: vi.fn(actual.registerCardDecorate) }
})

describe('registerCardDecorateAdapter', () => {
  it('installs the default adapter once, however many entries call it in one document', () => {
    registerCardDecorateAdapter()
    registerCardDecorateAdapter()

    expect(vi.mocked(registerCardDecorate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(registerCardDecorate).mock.calls[0]?.[0]).toBeTypeOf('function')
  })
})

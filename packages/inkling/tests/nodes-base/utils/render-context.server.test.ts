// @vitest-environment node
import { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import { describe, expect, it } from 'vitest'

describe('createRenderContext (server)', () => {
  it('throws the exact non-browser error without any document source', () => {
    expect(() => createRenderContext({})).toThrow(
      /^Must be passed a `createDocument` function as an option when used in a non-browser environment$/,
    )
  })
})

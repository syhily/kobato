import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useSnippets } from '../../../demo/utils/useSnippets'

describe('useSnippets', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('ignores malformed snippets stored in localStorage', () => {
    localStorage.setItem('snippets', '{}')

    const { result } = renderHook(() => useSnippets())

    expect(result.current.snippets).toEqual([])
  })
})

import { act, render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createTKHandleWrapper } from '#/utils/tk-handle'
import TKCountPlugin from '@/plugins/TKCountPlugin'

describe('TKCountPlugin', () => {
  it('reports the current tk count and follows handle updates', () => {
    const { handle, wrapper } = createTKHandleWrapper()
    handle.setState({ tkNodeMap: { 'top-1': ['tk-1', 'tk-2', 'tk-3'] }, tkCount: 3 })

    const onChange = vi.fn()
    render(<TKCountPlugin onChange={onChange} />, { wrapper })

    expect(onChange).toHaveBeenCalledWith(3)

    act(() => handle.setState({ tkNodeMap: { 'top-1': ['tk-1'] }, tkCount: 1 }))

    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('renders nothing and tolerates a missing onChange', () => {
    const { wrapper } = createTKHandleWrapper()
    const { container } = render(<TKCountPlugin />, { wrapper })

    expect(container.firstChild).toBeNull()
  })
})

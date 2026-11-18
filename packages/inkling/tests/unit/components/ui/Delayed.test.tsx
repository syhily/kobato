import { Delayed } from '@kobato/inkling-internal/components/ui/Delayed'
import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Delayed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders children immediately when waitBeforeShow is 0', () => {
    render(<Delayed waitBeforeShow={0}>hello</Delayed>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('hides children until the timeout elapses', () => {
    render(<Delayed waitBeforeShow={500}>hello</Delayed>)

    expect(screen.queryByText('hello')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})

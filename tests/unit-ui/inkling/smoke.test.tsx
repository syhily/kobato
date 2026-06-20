// Smoke test for the unit-ui test project. Verifies the harness
// (happy-dom + @testing-library/react + jest-dom matchers) is wired up
// before any real component tests depend on it.
//
// This file can be deleted once the regression suite under
// `tests/unit-ui/inkling/` has multiple real tests.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

function Counter() {
  return (
    <button type="button" onClick={vi.fn()}>
      click me
    </button>
  )
}

describe('unit-ui smoke', () => {
  it('renders a button into the DOM', () => {
    render(<Counter />)
    expect(screen.getByRole('button', { name: 'click me' })).toBeInTheDocument()
  })

  it('fires onClick on user click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <button type="button" onClick={onClick}>
        go
      </button>,
    )
    await user.click(screen.getByRole('button', { name: 'go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('cleans up the DOM between tests', () => {
    // After the previous test's `cleanup` (run by setup.ts afterEach),
    // the document body should be empty.
    expect(document.body).toBeEmptyDOMElement()
  })
})

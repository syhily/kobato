import { ActionToolbar } from '@kobato/inkling-internal/components/ui/ActionToolbar'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('ActionToolbar', () => {
  it('does not disable pointer events on the toolbar container', () => {
    const { container } = render(
      <ActionToolbar isVisible>
        <button type="button">child</button>
      </ActionToolbar>,
    )
    expect(container.firstChild).not.toHaveClass('pointer-events-none')
  })
})

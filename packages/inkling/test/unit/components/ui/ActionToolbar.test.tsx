import { render } from '@testing-library/react'

import { ActionToolbar } from '@/components/ui/ActionToolbar'

describe('ActionToolbar', () => {
  it('does not disable pointer events on the toolbar container', () => {
    // no DragDropHandleContext provider: the default handle reports
    // isDragging=false, so the toolbar renders
    const { container } = render(
      <ActionToolbar isVisible>
        <button type="button">child</button>
      </ActionToolbar>,
    )
    expect(container.firstChild).not.toHaveClass('pointer-events-none')
  })
})

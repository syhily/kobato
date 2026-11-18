import InklingComposableEditor from '@kobato/inkling-internal/components/InklingComposableEditor'
import InklingComposer from '@kobato/inkling-internal/components/InklingComposer'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

describe('InklingComposableEditor', () => {
  it('renders an editable surface with the default wrapper classes', () => {
    const { container } = render(
      <InklingComposer>
        <InklingComposableEditor dataTestId="editor" placeholderText="Start writing" />
      </InklingComposer>,
    )

    const wrapper = screen.getByTestId('editor')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper).toHaveClass('inkling-lexical')
    expect(container.querySelector('[contenteditable]')).toBeInTheDocument()
    expect(screen.getByText('Start writing')).toBeInTheDocument()
  })

  it('marks the editable surface readonly when readOnly is set', () => {
    const { container } = render(
      <InklingComposer>
        <InklingComposableEditor readOnly />
      </InklingComposer>,
    )

    expect(container.querySelector('[contenteditable]')).toHaveAttribute('readonly')
  })
})

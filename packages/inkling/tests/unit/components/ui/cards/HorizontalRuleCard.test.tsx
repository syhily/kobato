import { HorizontalRuleCard } from '@kobato/inkling-internal/components/ui/cards/HorizontalRuleCard'
import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

describe('HorizontalRuleCard', () => {
  it('renders a horizontal rule', () => {
    const { container } = render(<HorizontalRuleCard />)
    expect(container.querySelector('hr')).toBeInTheDocument()
  })
})

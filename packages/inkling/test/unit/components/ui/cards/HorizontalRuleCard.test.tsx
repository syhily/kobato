import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { HorizontalRuleCard } from '@/components/ui/cards/HorizontalRuleCard'

describe('HorizontalRuleCard', () => {
  it('renders a horizontal rule', () => {
    const { container } = render(<HorizontalRuleCard />)
    expect(container.querySelector('hr')).toBeInTheDocument()
  })
})

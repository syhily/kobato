import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { TabView } from '@/components/ui/TabView'

const initialTabs = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
]
const initialContent = { alpha: <div>Alpha content</div>, beta: <div>Beta content</div> }

describe('TabView', () => {
  it('renders the first tab and its content by default', () => {
    render(<TabView tabs={initialTabs} tabContent={initialContent} />)

    expect(screen.getByTestId('tab-contents-alpha')).toHaveTextContent('Alpha content')
  })

  it('switches content when a tab is clicked', () => {
    render(<TabView tabs={initialTabs} tabContent={initialContent} />)

    fireEvent.click(screen.getByTestId('tab-beta'))

    expect(screen.getByTestId('tab-contents-beta')).toHaveTextContent('Beta content')
  })

  it('falls back to the first tab when the active tab is removed from tabs', () => {
    const nextTabs = [
      { id: 'gamma', label: 'Gamma' },
      { id: 'delta', label: 'Delta' },
    ]
    const nextContent = { gamma: <div>Gamma content</div>, delta: <div>Delta content</div> }

    const { rerender } = render(<TabView tabs={initialTabs} tabContent={initialContent} />)

    fireEvent.click(screen.getByTestId('tab-beta'))

    rerender(<TabView tabs={nextTabs} tabContent={nextContent} />)

    expect(screen.queryByTestId('tab-contents-beta')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-contents-gamma')).toHaveTextContent('Gamma content')
  })

  it('keeps the active tab when it still exists after tabs change', () => {
    const nextTabs = [
      { id: 'beta', label: 'Beta' },
      { id: 'gamma', label: 'Gamma' },
    ]
    const nextContent = { beta: <div>Beta content</div>, gamma: <div>Gamma content</div> }

    const { rerender } = render(<TabView tabs={initialTabs} tabContent={initialContent} />)

    fireEvent.click(screen.getByTestId('tab-beta'))

    rerender(<TabView tabs={nextTabs} tabContent={nextContent} />)

    expect(screen.getByTestId('tab-contents-beta')).toHaveTextContent('Beta content')
  })
})

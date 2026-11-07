// @vitest-environment happy-dom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'

describe('ui/shared/notifications/NotificationBadge', () => {
  it('renders nothing at zero', () => {
    const { container } = render(<NotificationBadge count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the raw count at or below 99', () => {
    const { getByText } = render(<NotificationBadge count={5} />)
    expect(getByText('5')).toBeTruthy()
  })

  it('caps counts above 99 at 99+', () => {
    const { getByText } = render(<NotificationBadge count={100} />)
    expect(getByText('99+')).toBeTruthy()
  })

  it('merges a caller className into the shared classes', () => {
    const { getByText } = render(<NotificationBadge count={3} className="px-1.5" />)
    const badge = getByText('3')
    expect(badge.className).toContain('px-1.5')
    expect(badge.className).toContain('rounded-full')
  })
})

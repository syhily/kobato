// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { NavNotifications } = await import('@/ui/admin/shell/NavNotifications')

describe('ui/admin/shell/NavNotifications', () => {
  it('renders the unread badge from the prop and hides it at zero', () => {
    const { rerender } = render(<NavNotifications unreadCount={3} onOpen={() => {}} />)

    expect(screen.getByText('消息通知')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()

    rerender(<NavNotifications unreadCount={0} onOpen={() => {}} />)
    expect(screen.queryByText('3')).toBeNull()
  })

  it('caps the badge at 99+', () => {
    render(<NavNotifications unreadCount={128} onOpen={() => {}} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('calls onOpen on click — the shell owns the drawer and the count', () => {
    const onOpen = vi.fn()
    render(<NavNotifications unreadCount={2} onOpen={onOpen} />)

    fireEvent.click(screen.getByText('消息通知'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

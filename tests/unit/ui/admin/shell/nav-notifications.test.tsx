// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

interface CapturedDrawerProps {
  open: boolean
  isAdmin: boolean
}

const drawerProps: CapturedDrawerProps = { open: false, isAdmin: false }
vi.mock('@/ui/shared/notifications/LazyNotificationsDrawer', () => ({
  LazyNotificationsDrawer: (props: CapturedDrawerProps) => {
    drawerProps.open = props.open
    drawerProps.isAdmin = props.isAdmin
    return null
  },
  warmNotificationsDrawerChunk: vi.fn(),
}))

const control = mockTanstackQuery()

const { NavNotifications } = await import('@/ui/admin/shell/NavNotifications')

beforeEach(() => {
  control.query.data = { count: 0 }
  control.query.isPending = false
  control.query.isError = false
  drawerProps.open = false
  drawerProps.isAdmin = false
})

describe('ui/admin/shell/NavNotifications', () => {
  it('renders the unread badge and hides it at zero', () => {
    control.query.data = { count: 3 }
    const { rerender } = render(<NavNotifications role="admin" />)

    expect(screen.getByText('消息通知')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()

    control.query.data = { count: 0 }
    rerender(<NavNotifications role="admin" />)
    expect(screen.queryByText('3')).toBeNull()
  })

  it('caps the badge at 99+', () => {
    control.query.data = { count: 128 }
    render(<NavNotifications role="admin" />)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('opens the drawer on click and forwards the admin flag per role', () => {
    const { unmount } = render(<NavNotifications role="admin" />)
    fireEvent.click(screen.getByText('消息通知'))
    expect(drawerProps.open).toBe(true)
    expect(drawerProps.isAdmin).toBe(true)
    unmount()

    render(<NavNotifications role="author" />)
    fireEvent.click(screen.getByText('消息通知'))
    expect(drawerProps.isAdmin).toBe(false)
  })
})

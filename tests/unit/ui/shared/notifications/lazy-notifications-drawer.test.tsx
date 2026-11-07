// @vitest-environment happy-dom

import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

const control = mockTanstackQuery()

const { LazyNotificationsDrawer } = await import('@/ui/shared/notifications/LazyNotificationsDrawer')

beforeEach(() => {
  control.query.data = { count: 0 }
  control.query.isPending = false
  control.query.isError = false
  control.infinite.data = { pages: [] }
  control.infinite.isPending = false
  control.infinite.isError = false
  control.infinite.hasNextPage = false
  control.infinite.isFetchingNextPage = false
})

describe('ui/shared/notifications/LazyNotificationsDrawer', () => {
  it('renders nothing until the first open (SSR-stable)', () => {
    const { container } = render(<LazyNotificationsDrawer open={false} onOpenChange={() => {}} isAdmin={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('mounts the drawer on first open and keeps it mounted after close', async () => {
    const { rerender } = render(<LazyNotificationsDrawer open={false} onOpenChange={() => {}} isAdmin={false} />)
    rerender(<LazyNotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)

    // The everOpened effect + lazy chunk resolve on a later tick.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(await screen.findByText('消息通知', {}, { timeout: 3000 })).toBeTruthy()

    // Closing must not unmount the chain — drawer state survives reopen.
    rerender(<LazyNotificationsDrawer open={false} onOpenChange={() => {}} isAdmin={false} />)
    rerender(<LazyNotificationsDrawer open onOpenChange={() => {}} isAdmin={false} />)
    expect(await screen.findByText('消息通知')).toBeTruthy()
  })
})

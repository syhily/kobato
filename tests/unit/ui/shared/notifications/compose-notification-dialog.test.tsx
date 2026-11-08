// @vitest-environment happy-dom

import type { ReactElement, ReactNode } from 'react'

import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUserDto } from '@/shared/contracts/users'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'

const control = mockTanstackQuery()

// The dialog reads `useI18n()`; the provider is mounted as a render wrapper.
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => wrapWithI18n(children),
  })
}

// The recipient search contract: the typed keyword must reach the query input
// after the debounce window. The oRPC query-utils module is mocked to capture
// the exact input objects (react-query keeps the canonical mock).
const captured = vi.hoisted(() => ({
  queryInputs: [] as { q?: string; limit: number; offset: number }[],
  onDirectSuccess: [] as (() => void)[],
}))

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    notifications: { key: () => ['notifications'] },
    admin: {
      users: {
        list: {
          queryOptions: (options: { input: { q?: string; limit: number; offset: number } }) => {
            captured.queryInputs.push(options.input)
            return { queryKey: ['admin', 'users', 'list', options.input] }
          },
        },
      },
      notifications: {
        sendDirect: {
          mutationOptions: (options: { onSuccess?: () => void }) => {
            if (options.onSuccess !== undefined) {
              captured.onDirectSuccess.push(options.onSuccess)
            }
            return {}
          },
        },
        sendBroadcast: { mutationOptions: () => ({}) },
      },
    },
  },
}))

const { ComposeNotificationDialog } = await import('@/ui/shared/notifications/ComposeNotificationDialog')

function makeUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  return {
    id: '7',
    name: '小明',
    email: 'ming@example.com',
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    role: 'visitor',
    isMuted: false,
    emailVerified: true,
    createdAt: new Date('2026-11-01T00:00:00Z').toISOString(),
    deletedAt: null,
    commentCount: 0,
    pendingCount: 0,
    lastCommentAt: null,
    passkeyCount: 0,
    loginMethod: 'password',
    ...overrides,
  }
}

beforeEach(() => {
  control.query.data = { users: [], total: 0 }
  control.query.isPending = false
  control.query.isError = false
  control.mutation.mutate.mockClear()
  captured.queryInputs.length = 0
  captured.onDirectSuccess.length = 0
})

function fill(title: string, body: string) {
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: title } })
  fireEvent.change(screen.getByLabelText('内容'), { target: { value: body } })
}

function lastQueryInput() {
  return captured.queryInputs[captured.queryInputs.length - 1]
}

describe('ui/shared/notifications/ComposeNotificationDialog', () => {
  it('defaults to broadcast mode and reveals the recipient picker in direct mode', () => {
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)

    // Broadcast mode: the replyable switch shows, no recipient picker.
    expect(screen.getByLabelText('允许回复')).toBeTruthy()
    expect(screen.queryByLabelText('收件人')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '私信' }))
    expect(screen.getByLabelText('收件人')).toBeTruthy()
    expect(screen.queryByLabelText('允许回复')).toBeNull()
  })

  it('gates the submit button on title and body', () => {
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    const submit = screen.getByRole('button', { name: '发布公告' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fill('系统维护', '')
    expect(submit.disabled).toBe(true)

    fill('系统维护', '今晚 24 点例行维护')
    expect(submit.disabled).toBe(false)
  })

  it('keeps the direct submit disabled without a recipient', () => {
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: '私信' }))
    fill('你好', '在吗')

    const submit = screen.getByRole('button', { name: '发送私信' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(submit)
    expect(control.mutation.mutate).not.toHaveBeenCalled()
  })

  it('sends a direct message to the picked recipient', () => {
    control.query.data = { users: [makeUser()], total: 1 }
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: '私信' }))
    fireEvent.click(screen.getByText('小明'))
    fill('合作邀请', '有兴趣吗')

    fireEvent.click(screen.getByRole('button', { name: '发送私信' }))

    expect(control.mutation.mutate).toHaveBeenCalledWith({ userId: '7', title: '合作邀请', body: '有兴趣吗' })
  })

  it('sends the debounced keyword to the recipient search', async () => {
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: '私信' }))

    fireEvent.change(screen.getByLabelText('收件人'), { target: { value: '小明' } })

    await waitFor(() => {
      expect(lastQueryInput()).toEqual({ q: '小明', limit: 8, offset: 0 })
    })
  })

  it('clears the keyword from the recipient search when the input is emptied', async () => {
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: '私信' }))

    const input = screen.getByLabelText('收件人')
    fireEvent.change(input, { target: { value: '小明' } })
    await waitFor(() => {
      expect(lastQueryInput()).toEqual({ q: '小明', limit: 8, offset: 0 })
    })

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => {
      expect(lastQueryInput()).toEqual({ q: undefined, limit: 8, offset: 0 })
    })
  })

  it('resets to broadcast mode after a successful direct send', () => {
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: '私信' }))
    expect(screen.getByLabelText('收件人')).toBeTruthy()

    act(() => captured.onDirectSuccess.at(-1)?.())

    expect(screen.getByLabelText('允许回复')).toBeTruthy()
    expect(screen.queryByLabelText('收件人')).toBeNull()
  })

  it('shows a retry message when the recipient search fails', () => {
    control.query.isError = true
    render(<ComposeNotificationDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: '私信' }))

    expect(screen.getByText('搜索失败，请重试')).toBeTruthy()
    expect(screen.queryByText('没有匹配的用户')).toBeNull()
  })
})

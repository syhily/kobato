// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { AdminUserDto } from '@/shared/contracts/users'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

const control = mockTanstackQuery()

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
})

function fill(title: string, body: string) {
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: title } })
  fireEvent.change(screen.getByLabelText('内容'), { target: { value: body } })
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
})

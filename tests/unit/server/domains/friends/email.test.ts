import { describe, expect, it, vi } from 'vitest'

import type { FriendRow } from '@/server/infra/db/types'

import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'

// Capture the seam call instead of rendering/sending: these tests pin
// the data mapping (application → layout props + subject suffix), while
// the layout itself has its own render suite and the seam its own suite.
vi.mock('@/server/infra/email/admin-notification', () => ({
  sendAdminNotification: vi.fn(async () => ({ ok: true })),
}))

const { sendAdminNotification } = await import('@/server/infra/email/admin-notification')
const { sendNewFriendApplication } = await import('@/server/domains/friends/email')

const friend = {
  website: '小鱼的博客',
  homepage: 'https://blog.example.com',
  description: '记录前端与生活',
  rssUrl: 'https://blog.example.com/feed.xml',
} as FriendRow

function lastCall(): { subject: string; props: Record<string, unknown> } {
  const calls = vi.mocked(sendAdminNotification).mock.calls
  const [{ subject, element }] = calls[calls.length - 1]
  return { subject, props: element.props as Record<string, unknown> }
}

describe('friends/email — sendNewFriendApplication', () => {
  it('maps the application onto the admin-notification layout', async () => {
    const result = await sendNewFriendApplication(friend)

    expect(result).toEqual({ ok: true })
    const { subject, props } = lastCall()
    expect(subject).toBe('收到了新的友链申请')
    expect(props.title).toBe('新友链申请')
    expect(props.preview).toBe('「小鱼的博客」申请交换友链')
    expect(props.contextLine).toBeUndefined()
    expect(props.mutedNote).toBe('该申请等待审核，通过后才会在公共页面展示')
    expect(props.rows).toEqual([
      { label: '站名：', value: '小鱼的博客' },
      { label: '主页：', value: 'https://blog.example.com' },
      { label: '简介：', value: '记录前端与生活' },
      { label: 'RSS：', value: 'https://blog.example.com/feed.xml' },
    ])
    // `https://example.com` is the test settings fixture's site URL.
    expect(props.cta).toEqual({ label: '前往审核', href: 'https://example.com/admin/taxonomy/friends' })
  })

  it('renders through AdminNotificationEmail', async () => {
    await sendNewFriendApplication(friend)

    const calls = vi.mocked(sendAdminNotification).mock.calls
    expect(calls[calls.length - 1][0].element.type).toBe(AdminNotificationEmail)
  })

  it('drops the optional rows when description and rssUrl are absent', async () => {
    await sendNewFriendApplication({ ...friend, description: null, rssUrl: null })

    const { props } = lastCall()
    expect(props.rows).toEqual([
      { label: '站名：', value: '小鱼的博客' },
      { label: '主页：', value: 'https://blog.example.com' },
    ])
  })
})

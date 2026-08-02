import { describe, expect, it, vi } from 'vitest'

import type { WebmentionRow } from '@/server/infra/db/types'

import { AdminNotificationEmail } from '@/server/infra/email/templates/AdminNotificationEmail'

// Capture the seam call instead of rendering/sending: these tests pin
// the data mapping (mention → layout props + subject suffix), while the
// layout itself has its own render suite and the seam its own suite.
vi.mock('@/server/infra/email/admin-notification', () => ({
  sendAdminNotification: vi.fn(async () => ({ ok: true })),
}))

const { sendAdminNotification } = await import('@/server/infra/email/admin-notification')
const { sendNewWebmention } = await import('@/server/domains/webmentions/email')

const mention = {
  sourceUrl: 'https://sender.example/mentioning-post',
  title: '提及了你的文章',
  authorName: 'Jane Doe',
  summary: '一段摘要。',
} as WebmentionRow

const target = { title: '目标文章标题', canonicalUrl: 'https://example.com/posts/target/' }

function lastCall(): { subject: string; props: Record<string, unknown> } {
  const calls = vi.mocked(sendAdminNotification).mock.calls
  const [{ subject, element }] = calls[calls.length - 1]
  return { subject, props: element.props as Record<string, unknown> }
}

describe('webmentions/email — sendNewWebmention', () => {
  it('maps the mention onto the admin-notification layout', async () => {
    const result = await sendNewWebmention(mention, target)

    expect(result).toEqual({ ok: true })
    const { subject, props } = lastCall()
    expect(subject).toBe('收到了新的 Webmention')
    expect(props.title).toBe('新 Webmention')
    expect(props.preview).toBe('《目标文章标题》收到一条新的 Webmention')
    expect(props.contextLine).toEqual({
      label: '目标文章：',
      link: { text: '目标文章标题', href: 'https://example.com/posts/target/' },
    })
    expect(props.mutedNote).toBe('该提及已通过来源校验，等待审核')
    expect(props.rows).toEqual([
      { label: '来源：', value: '提及了你的文章' },
      { label: '作者：', value: 'Jane Doe' },
      { value: '一段摘要。' },
    ])
    expect(props.cta).toEqual({ label: '查看来源', href: 'https://sender.example/mentioning-post' })
  })

  it('renders through AdminNotificationEmail', async () => {
    await sendNewWebmention(mention, target)

    const calls = vi.mocked(sendAdminNotification).mock.calls
    expect(calls[calls.length - 1][0].element.type).toBe(AdminNotificationEmail)
  })

  it('falls back to the source URL and drops the optional rows', async () => {
    await sendNewWebmention({ ...mention, title: null, authorName: null, summary: null }, target)

    const { props } = lastCall()
    expect(props.rows).toEqual([{ label: '来源：', value: 'https://sender.example/mentioning-post' }])
  })

  it('marks the copy as an update re-review when `updated` is set (R14)', async () => {
    await sendNewWebmention(mention, target, { updated: true })

    const { subject, props } = lastCall()
    expect(subject).toBe('Webmention 内容已更新，等待重新审核')
    expect(props.title).toBe('Webmention 已更新')
    expect(props.preview).toBe('《目标文章标题》的一条 Webmention 内容已更新')
    expect(props.mutedNote).toBe('该提及的内容已更新，已通过来源校验，等待重新审核')
  })
})

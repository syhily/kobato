import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '@/server/infra/email/render'
import AdminNotificationEmail from '@/server/infra/email/templates/AdminNotificationEmail'

function renderTemplate(props: Partial<Parameters<typeof AdminNotificationEmail>[0]> = {}): string {
  return render(
    createElement(AdminNotificationEmail, {
      preview: '在《目标文章》中有一条新留言',
      title: '新留言',
      contextLine: {
        label: '留言文章：',
        link: { text: '目标文章', href: 'https://example.com/posts/target/' },
      },
      mutedNote: '该留言需要审核',
      rows: [{ label: '来源：', value: '来源站点' }, { label: '作者：', value: 'Jane Doe' }, { value: '一段摘要。' }],
      cta: { label: '查看留言', href: 'https://example.com/posts/target/#user-comment-1' },
      ...props,
    }),
  )
}

describe('email/templates/AdminNotificationEmail', () => {
  it('greets the site author and embeds the preheader', () => {
    const html = renderTemplate()
    expect(html).toContain('你好，雨帆')
    expect(html).toContain('在《目标文章》中有一条新留言')
  })

  it('renders the title, context link, muted note, rows and the CTA', () => {
    const html = renderTemplate()
    expect(html).toContain('新留言')
    expect(html).toContain('留言文章：')
    expect(html).toContain('href="https://example.com/posts/target/"')
    expect(html).toContain('目标文章')
    expect(html).toContain('该留言需要审核')
    expect(html).toContain('来源站点')
    expect(html).toContain('作者：')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('一段摘要。')
    expect(html).toContain('查看留言')
    expect(html).toContain('href="https://example.com/posts/target/#user-comment-1"')
  })

  it('omits the context line and the muted note when absent', () => {
    const html = renderTemplate({ contextLine: undefined, mutedNote: undefined })
    expect(html).not.toContain('留言文章：')
    expect(html).not.toContain('该留言需要审核')
    expect(html).toContain('新留言')
  })

  it('renders html rows raw (comment bodies are pre-sanitised)', () => {
    const html = renderTemplate({ rows: [{ html: '<p>写得非常<strong>清楚</strong></p>' }] })
    expect(html).toContain('<p>写得非常<strong>清楚</strong></p>')
    expect(html).toContain('data-safe-html-strategy="email"')
  })

  it('escapes HTML in text rows, titles and notes', () => {
    const html = renderTemplate({
      title: '<script>alert(1)</script>',
      mutedNote: '<b>x</b>',
      rows: [{ label: '站名：', value: '<script>alert(2)</script>' }],
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(2)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

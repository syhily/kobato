import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '@/server/infra/email/render'
import NewWebmention from '@/server/infra/email/templates/NewWebmention'

function renderTemplate(props: Partial<Parameters<typeof NewWebmention>[0]> = {}): string {
  return render(
    createElement(NewWebmention, {
      postTitle: '目标文章标题',
      postLink: 'https://example.com/posts/target/',
      sourceUrl: 'https://sender.example/mentioning-post',
      sourceTitle: '提及了你的文章',
      authorName: 'Jane Doe',
      summary: '一段摘要。',
      ...props,
    }),
  )
}

describe('email/templates/NewWebmention', () => {
  it('renders the target link and the source link', () => {
    const html = renderTemplate()
    expect(html).toContain('href="https://example.com/posts/target/"')
    expect(html).toContain('目标文章标题')
    expect(html).toContain('href="https://sender.example/mentioning-post"')
    expect(html).toContain('提及了你的文章')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('一段摘要。')
  })

  it('falls back to the raw source URL when no title was extracted', () => {
    const html = renderTemplate({ sourceTitle: null, authorName: null, summary: null })
    expect(html).toContain('来源：https://sender.example/mentioning-post')
  })

  it('escapes HTML in extracted fields', () => {
    const html = renderTemplate({ sourceTitle: '<script>alert(1)</script>', authorName: '<b>x</b>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

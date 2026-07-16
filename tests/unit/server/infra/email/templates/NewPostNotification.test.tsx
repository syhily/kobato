import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '@/server/infra/email/render'
import NewPostNotification from '@/server/infra/email/templates/NewPostNotification'

function renderTemplate(props: { postTitle?: string; postSummary?: string } = {}): string {
  return render(
    createElement(NewPostNotification, {
      postTitle: props.postTitle ?? '使用 React Router 8 搭建博客',
      postLink: 'https://example.com/posts/react-router-8',
      postSummary: props.postSummary,
      unsubscribeLink: 'https://example.com/newsletter/unsubscribe?id=42&sig=deadbeef',
    }),
  )
}

describe('email/templates/NewPostNotification', () => {
  it('links the post title and renders the read-more CTA', () => {
    const html = renderTemplate()
    expect(html).toContain('使用 React Router 8 搭建博客')
    expect(html).toContain('href="https://example.com/posts/react-router-8"')
    expect(html).toContain('阅读全文')
  })

  it('carries the one-click unsubscribe link', () => {
    const html = renderTemplate()
    expect(html).toContain('href="https://example.com/newsletter/unsubscribe?id=42&amp;sig=deadbeef"')
    expect(html).toContain('退订')
  })

  it('renders the summary only when provided', () => {
    const withSummary = renderTemplate({ postSummary: '这一篇讲数据加载。' })
    expect(withSummary).toContain('这一篇讲数据加载。')
    const withoutSummary = renderTemplate()
    expect(withoutSummary).not.toContain('这一篇讲数据加载。')
  })

  it('escapes HTML in the post title', () => {
    const html = renderTemplate({ postTitle: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x')
  })
})

import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { render } from '@/server/infra/email/render'
import NewFriendApplication from '@/server/infra/email/templates/NewFriendApplication'

function renderTemplate(props: Partial<Parameters<typeof NewFriendApplication>[0]> = {}): string {
  return render(
    createElement(NewFriendApplication, {
      website: '小鱼的博客',
      homepage: 'https://blog.example.com',
      description: '记录前端与生活',
      rssUrl: 'https://blog.example.com/feed.xml',
      reviewLink: 'https://example.com/admin/taxonomy/friends',
      ...props,
    }),
  )
}

describe('email/templates/NewFriendApplication', () => {
  it('renders the applicant fields and the review link', () => {
    const html = renderTemplate()
    expect(html).toContain('小鱼的博客')
    expect(html).toContain('https://blog.example.com')
    expect(html).toContain('记录前端与生活')
    expect(html).toContain('https://blog.example.com/feed.xml')
    expect(html).toContain('href="https://example.com/admin/taxonomy/friends"')
  })

  it('omits the optional rows when description and rssUrl are absent', () => {
    const html = renderTemplate({ description: null, rssUrl: null })
    expect(html).not.toContain('简介：')
    expect(html).not.toContain('RSS：')
  })

  it('escapes HTML in applicant-supplied fields', () => {
    const html = renderTemplate({ website: '<script>alert(1)</script>', description: '<b>x</b>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

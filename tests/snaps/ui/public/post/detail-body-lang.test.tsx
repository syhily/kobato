import { describe, expect, it } from 'vitest'

import type { DetailPageComments } from '@/shared/types/comments'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter } from '#/_helpers/render'
import { DetailBodyChrome } from '@/ui/public/post/DetailBodyChrome'

const siteIdentity = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!

// SSR parity for the content-language boundary: the UI renders in en-US while the prose
// is whatever the author declared. Only the body container takes the author's `lang` and
// `dir="auto"` (so RTL prose lays out correctly); every other element keeps the UI
// locale/direction, and an unset value renders neither attribute.

// `comments={false}` keeps the streamed promise out of the SSR tree.
const neverSettles = new Promise<never>(() => undefined)

function renderBody({
  contentLanguage,
  title,
  bodyHtml,
  permalink,
}: {
  contentLanguage?: string | null
  title: string
  bodyHtml: string
  permalink: string
}): string {
  return renderInRouter(
    <DetailBodyChrome
      siteIdentity={siteIdentity}
      title={title}
      date={new Date('2026-05-01T00:00:00.000Z')}
      showUpdated
      headings={[]}
      likes={0}
      permalink={permalink}
      commentKey="comment-key"
      commentsPromise={neverSettles as Promise<DetailPageComments>}
      bodyHtml={bodyHtml}
      contentLanguage={contentLanguage}
      postContentRef={{ current: null }}
    />,
    '/',
    { locale: 'en-US' },
  )
}

describe('snapshot: DetailBodyChrome content language', () => {
  it('stamps the body container lang while the chrome stays in the UI locale', () => {
    const html = renderBody({
      contentLanguage: 'zh-CN',
      title: '中文标题：内容语言的边界',
      bodyHtml: '<p>这是一段中文正文。</p>',
      permalink: '/posts/zh-content',
    })

    // The body container is the only element carrying the author's tag.
    expect(html).toMatch(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*lang="zh-CN"/)
    // Content is never translated; the chrome is English.
    expect(html).toContain('中文标题：内容语言的边界')
    expect(html).toContain('这是一段中文正文。')
    expect(html).toContain('Updated')
    expect(html).not.toContain('修改于')
    // Exactly one `lang` attribute in the fragment — no locale leaks.
    expect(html.match(/lang="/g)).toHaveLength(1)
  })

  it.each([
    ['ar-EG', 'عنوان عربي', '<p>هذا نص عربي.</p>', '/posts/ar-content'],
    ['he', 'כותרת בעברית', '<p>זהו טקסט בעברית.</p>', '/posts/he-content'],
    ['fa', 'عنوان فارسی', '<p>این یک متن فارسی است.</p>', '/posts/fa-content'],
  ])(
    'lets RTL prose (%s) set its own direction without flipping the chrome',
    (contentLanguage, title, body, permalink) => {
      const html = renderBody({ contentLanguage, title, bodyHtml: body, permalink })

      // Explicit content language always stamps `dir="auto"`: the browser reads
      // the paragraph direction from the first strong character.
      expect(html).toMatch(
        new RegExp(`<div[^>]*class="[^"]*post-content[^"]*"[^>]*lang="${contentLanguage}"[^>]*dir="auto"`),
      )
      // RTL content and title render verbatim.
      expect(html).toContain(title)
      expect(html).toContain(body)
      // Chrome direction is untouched: no forced `dir="rtl"` and exactly one
      // `dir` attribute in the whole fragment (the body container's).
      expect(html).not.toContain('dir="rtl"')
      expect(html.match(/dir="/g)).toHaveLength(1)
      // The UI locale still renders the chrome copy in English.
      expect(html).toContain('Updated')
    },
  )

  it('stamps dir="auto" for an explicitly declared en-US body too', () => {
    const html = renderBody({
      contentLanguage: 'en-US',
      title: 'English title',
      bodyHtml: '<p>English body.</p>',
      permalink: '/posts/en-content',
    })

    expect(html).toMatch(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*lang="en-US"[^>]*dir="auto"/)
    expect(html).toContain('English body.')
    expect(html.match(/dir="/g)).toHaveLength(1)
  })

  it('renders neither lang nor dir when the content language is unset', () => {
    const html = renderBody({
      contentLanguage: null,
      title: 'Untitled',
      bodyHtml: '<p>Plain body.</p>',
      permalink: '/posts/plain',
    })

    expect(html).toMatch(/<div[^>]*class="[^"]*post-content[^"]*"/)
    expect(html).not.toMatch(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*lang=/)
    expect(html).not.toMatch(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*dir=/)
    expect(html).not.toContain('lang="')
    expect(html).not.toContain('dir="')
  })
})

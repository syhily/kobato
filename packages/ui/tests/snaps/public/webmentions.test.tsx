import type { PublicWebmentionWire } from '@kobato/shared/contracts/webmentions'

import { renderToHtml, stableHtml } from '#/_helpers/render'

import { WebmentionList } from '@kobato/ui/public/webmentions/WebmentionList'
import { describe, expect, it } from 'vitest'

function makeMention(overrides: Partial<PublicWebmentionWire> = {}): PublicWebmentionWire {
  return {
    id: '1',
    sourceUrl: 'https://sender.example/mentioning-post',
    type: 'mention',
    authorName: 'Jane Doe',
    title: '提及了你的文章',
    summary: '一段摘要。',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('snapshot: WebmentionList (public)', () => {
  it('renders nothing when there are no approved mentions', () => {
    expect(renderToHtml(<WebmentionList mentions={[]} />)).toBe('')
  })

  it('renders the section header with count and the mention cards', () => {
    const mentions = [makeMention(), makeMention({ id: '2', authorName: null, title: null, summary: null })]
    const html = stableHtml(renderToHtml(<WebmentionList mentions={mentions} />))
    expect(html).toContain('引用与回应')
    // SSR interleaves text nodes with <!-- --> separators around the count.
    expect(html).toMatch(/\(.*?2.*?\)/)
    expect(html).toContain('Jane Doe')
    expect(html).toContain('提及了你的文章')
    expect(html).toContain('一段摘要。')
    // External links always open off-site without opener access.
    expect(html).toContain('href="https://sender.example/mentioning-post"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
    // The authorless/titleless card falls back to the hostname and the raw URL.
    expect(html).toContain('sender.example')
  })

  it('groups likes and reposts as compact author rows, replies and mentions as cards', () => {
    const mentions = [
      makeMention({ id: '1', type: 'reply' }),
      makeMention({ id: '2', type: 'like', authorName: 'Liker Ann', title: null, summary: null }),
      makeMention({ id: '3', type: 'repost', authorName: null, title: null, summary: null }),
    ]
    const html = stableHtml(renderToHtml(<WebmentionList mentions={mentions} />))
    expect(html).toMatch(/\(.*?3.*?\)/)
    // The reply keeps the full card treatment.
    expect(html).toContain('提及了你的文章')
    // Likes / reposts render under their own compact group labels…
    expect(html).toContain('喜欢')
    expect(html).toContain('转发')
    expect(html).toContain('Liker Ann')
    // …with the authorless repost falling back to the source hostname.
    expect(html).toContain('sender.example')
  })
})

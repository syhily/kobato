import type { MarkdownHeading } from '@kobato/inkling/headless/toc'

import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { TableOfContents } from '@sayaka/ui/post/TableOfContents'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const headings: MarkdownHeading[] = [
  { depth: 2, slug: 'intro', text: 'Intro' },
  { depth: 5, slug: 'deep', text: 'Deep' },
]

describe('ui/post/toc/TableOfContents', () => {
  it('renders outside BlogSettingsProvider using safe defaults', () => {
    const previous = getBlogSettingsBundleSync()
    setBlogSettingsBundleForTests(null)
    try {
      const html = renderToStaticMarkup(wrapWithI18n(<TableOfContents headings={headings} toc="enabled" />))
      expect(html).toContain('href="#intro"')
      expect(html).not.toContain('href="#deep"')
    } finally {
      setBlogSettingsBundleForTests(previous)
    }
  })

  it('marks the closed drawer as inert and removes its links from the tab order', () => {
    const html = renderToStaticMarkup(wrapWithI18n(<TableOfContents headings={headings} toc="enabled" />))
    expect(html).toContain('inert')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('tabindex="-1"')
  })
})

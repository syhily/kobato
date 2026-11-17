import type { MarkdownHeading } from '@kobato/shared/utils/toc.ts'

import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters.ts'
import { setBlogSettingsBundleForTests } from '@kobato/test-helpers/blog-settings.ts'
import { wrapWithI18n } from '@kobato/test-helpers/i18n-render.tsx'
import { TableOfContents } from '@kobato/web/ui/public/post/TableOfContents.tsx'
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

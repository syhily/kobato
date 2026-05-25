import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { MarkdownHeading } from '@/shared/types/catalog'

import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { TableOfContents } from '@/ui/public/post/TableOfContents'

const headings: MarkdownHeading[] = [
  { depth: 2, slug: 'intro', text: 'Intro' },
  { depth: 5, slug: 'deep', text: 'Deep' },
]

describe('ui/post/toc/TableOfContents', () => {
  it('renders outside BlogSettingsProvider using safe defaults', () => {
    const previous = getBlogSettingsBundleSync()
    setBlogSettingsBundleForTests(null)
    try {
      const html = renderToStaticMarkup(<TableOfContents headings={headings} toc="enabled" />)
      expect(html).toContain('href="#intro"')
      expect(html).not.toContain('href="#deep"')
    } finally {
      setBlogSettingsBundleForTests(previous)
    }
  })
})

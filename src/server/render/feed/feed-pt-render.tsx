import type { ComponentType, ReactNode } from 'react'

import type { PortableTextBody as PortableTextBodyType } from '@/shared/pt/schema'

import { prerenderToHtml } from '@/server/render/react-prerender'
import { requireBlogSettingsBundle, requireBlogSettingsSection } from '@/shared/config/blog'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'

export interface RenderPortableTextToHtmlOptions {
  rssMode?: boolean
  suppressMusicAutoplay?: boolean
}

interface PortableTextBodyProps {
  body: PortableTextBodyType
  headingSlugs: readonly string[]
  footnotesSectionTitle: string
  rssMode?: boolean
  suppressMusicAutoplay?: boolean
}

interface BlogSettingsProviderProps {
  value: unknown
  children: ReactNode
}

export async function renderPortableTextToHtml(
  body: PortableTextBodyType,
  headingSlugs: readonly string[],
  options: RenderPortableTextToHtmlOptions = {},
): Promise<string> {
  const bundle = requireBlogSettingsBundle()
  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))

  // Dynamic import breaks the static server→ui dependency at build time.
  // This helper only runs during SSR (RSS/Atom feed generation and admin
  // preview), so the UI components are never shipped to the browser bundle.
  const [{ BlogSettingsProvider }, { PortableTextBody }] = await Promise.all([
    import('@/shared/lib/blog-config-context') as Promise<{
      BlogSettingsProvider: ComponentType<BlogSettingsProviderProps>
    }>,
    import('@/ui/pt/render') as Promise<{
      PortableTextBody: ComponentType<PortableTextBodyProps>
    }>,
  ])

  return prerenderToHtml(
    <BlogSettingsProvider value={bundle}>
      <PortableTextBody
        body={body}
        headingSlugs={headingSlugs}
        footnotesSectionTitle={footnotesSectionTitle}
        rssMode={options.rssMode}
        suppressMusicAutoplay={options.suppressMusicAutoplay}
      />
    </BlogSettingsProvider>,
  )
}

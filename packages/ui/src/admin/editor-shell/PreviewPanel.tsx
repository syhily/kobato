import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { useMediumZoom } from '@kobato/client/hooks/use-medium-zoom'
import { LexicalBody as LexicalBodyRenderer } from '@kobato/editor/lexical-html/LexicalBody'
import { useContentSettings, useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { resolveFootnotesSectionTitle } from '@kobato/shared/utils/footnotes-section-title'
import { useDeferredValue, useMemo, useRef } from 'react'

export interface PreviewPaneProps {
  body: LexicalBody
  title: string
  slug: string
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
}

export function PreviewPane({ body, title, slug, scrollContainerRef }: PreviewPaneProps) {
  const previewPostContentRef = useRef<HTMLDivElement>(null)
  useMediumZoom(previewPostContentRef)

  const deferredBody = useDeferredValue(body)
  const isStale = deferredBody !== body
  const renderedBody = useMemo(() => deferredBody, [deferredBody])

  const { website } = useSiteIdentity()
  const content = useContentSettings()
  const trimmedTitle = title.trim()
  const trimmedSlug = slug.trim()
  const siteOrigin = website.replace(/\/+$/, '')
  const fullUrl = trimmedSlug === '' ? `${siteOrigin}/` : `${siteOrigin}/${trimmedSlug}`

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>实时预览</span>
          {isStale ? <span className="font-mono">渲染中…</span> : null}
        </div>
      </div>
      <div ref={scrollContainerRef} className="min-h-0 grow overflow-y-auto">
        {/* While live preview is on, the editor hides its own title/slug
         *  strip — the preview still renders the title for visual parity
         *  with the public detail route, and so the first line on each
         *  side of the split view shares a horizontal baseline. */}
        <header className="mb-3 flex flex-col gap-1 border-b pb-3">
          <h1 className="text-2xl leading-tight font-bold tracking-tight md:text-3xl">
            {trimmedTitle === '' ? <span className="text-muted-foreground">页面标题</span> : trimmedTitle}
          </h1>
          {trimmedSlug === '' ? (
            <div className="font-mono text-xs text-muted-foreground italic">
              {siteOrigin}/<span>留空将根据标题按拼音生成</span>
            </div>
          ) : (
            <a
              href={fullUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs break-all text-muted-foreground hover:text-foreground hover:underline"
            >
              {fullUrl}
            </a>
          )}
        </header>
        <div ref={previewPostContentRef} className="post-content prose-blog prose prose-lg max-w-none">
          <LexicalBodyRenderer
            body={renderedBody}
            musicAutoplay="suppressed"
            footnotesSectionTitle={resolveFootnotesSectionTitle(content)}
          />
        </div>
      </div>
    </div>
  )
}

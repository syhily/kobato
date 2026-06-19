import { useDeferredValue, useMemo, useRef } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { useContentSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { resolveFootnotesSectionTitle } from '@/shared/utils/footnotes-section-title'
import { InklingBody } from '@/ui/inkling/render/InklingBody'

export interface PreviewPaneProps {
  body: InklingDocument
  title: string
  slug: string
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
}

export function PreviewPane({ body, title, slug, scrollContainerRef }: PreviewPaneProps) {
  const previewPostContentRef = useRef<HTMLDivElement>(null)

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
        {/* Mirror of the title + slug surfaces that normally live
         *  above the editor. While live preview is on, the editor
         *  hides its own strip and the operator edits the values via
         *  the metadata sheet — but the preview still needs to show
         *  the page title for visual parity with the public detail
         *  route, AND so the first line on each side of the split
         *  view sits on the same horizontal baseline. */}
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
          <InklingBody
            document={renderedBody}
            footnotesSectionTitle={content !== undefined ? resolveFootnotesSectionTitle(content) : undefined}
          />
        </div>
      </div>
    </div>
  )
}

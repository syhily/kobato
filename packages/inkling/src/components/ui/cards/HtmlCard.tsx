import { LazyCardEditor } from '@kobato/inkling-internal/components/ui/cards/LazyCardEditor'
import { ReadOnlyOverlay } from '@kobato/inkling-internal/components/ui/ReadOnlyOverlay'
import { sanitizeHtml } from '@kobato/inkling-internal/utils/sanitize-html'
import { lazy } from 'react'
const LazyHtmlEditor = lazy(() => import('@kobato/inkling-internal/components/ui/cards/HtmlCard/HtmlEditor'))

function HtmlEditorFallback({ html }: { html?: string }) {
  return (
    <div className="not-inkling-prose min-h-[17rem]">
      <pre className="px-[0.8rem] py-[0.7rem] font-mono text-[1.6rem] leading-[2.25rem] whitespace-pre-wrap">
        {html}
      </pre>
    </div>
  )
}

export function HtmlCard({
  html,
  updateHtml,
  isEditing,
  darkMode,
}: {
  html?: string
  updateHtml: (value: string) => void
  isEditing?: boolean
  darkMode?: boolean
}) {
  return (
    <>
      {isEditing ? (
        <LazyCardEditor fallback={<HtmlEditorFallback html={html} />}>
          <LazyHtmlEditor darkMode={darkMode} html={html} updateHtml={updateHtml} />
        </LazyCardEditor>
      ) : (
        <div>
          <HtmlDisplay html={html} />
          <ReadOnlyOverlay />
        </div>
      )}
    </>
  )
}

function HtmlDisplay({ html }: { html?: string }) {
  const sanitizedHtml = sanitizeHtml(html, { replaceJS: true })

  return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} className="min-h-[3.5vh] whitespace-normal"></div>
}

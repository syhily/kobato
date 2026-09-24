import React from 'react'

import { LazyCardEditor } from '@/inkling/components/ui/cards/LazyCardEditor'
import { ReadOnlyOverlay } from '@/inkling/components/ui/ReadOnlyOverlay'
import { sanitizeHtml } from '@/inkling/utils/sanitize-html'

// The CodeMirror-backed editor loads behind the hydration-safe lazy boundary
// (LazyCardEditor): the SSR'd canvas and the first client render both show
// the static source fallback, then the editor chunk takes over after mount.
const LazyHtmlEditor = React.lazy(() => import('@/inkling/components/ui/cards/HtmlCard/HtmlEditor'))

// Static read-only mirror of the editor's initial state: the raw source at
// the CodeMirror surface's min-height and type metrics.
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

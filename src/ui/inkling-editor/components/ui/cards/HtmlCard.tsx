import HtmlEditor from '@/ui/inkling-editor/components/ui/cards/HtmlCard/HtmlEditor'
import { sanitizeHtml } from '@/ui/inkling-editor/utils/sanitize-html'

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
        <>
          <HtmlEditor darkMode={darkMode} html={html} updateHtml={updateHtml} />
        </>
      ) : (
        <div>
          <HtmlDisplay html={html} />
          <div className="absolute inset-0 z-50 mt-0"></div>
        </div>
      )}
    </>
  )
}

function HtmlDisplay({ html }: { html?: string }) {
  const sanitizedHtml = sanitizeHtml(html, { replaceJS: true })

  return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} className="min-h-[3.5vh] whitespace-normal"></div>
}

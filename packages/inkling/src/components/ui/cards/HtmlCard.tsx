import HtmlEditor from '@/components/ui/cards/HtmlCard/HtmlEditor'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import { sanitizeHtml } from '@/utils/sanitize-html'

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

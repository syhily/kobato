import { sanitizeHtml } from '@kobato/sanitize/sanitize-html'
import { useMemo } from 'react'

export function CommentContentHtml({ content, className }: { content: string | null; className?: string }) {
  const clean = useMemo(() => sanitizeHtml(content ?? '', 'comment'), [content])
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

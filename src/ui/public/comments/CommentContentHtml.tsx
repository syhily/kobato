import { useMemo } from 'react'

import { sanitizeHtml } from '@/shared/sanitize/sanitize-html'

// Renders the saved comment `content` column (the inkling feed-variant HTML projection).
// Sanitization happens at this render boundary on both engines (SSR node / hydration
// DOMPurify) because storage keeps the raw projection.
export function CommentContentHtml({ content, className }: { content: string | null; className?: string }) {
  const clean = useMemo(() => sanitizeHtml(content ?? '', 'comment'), [content])
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

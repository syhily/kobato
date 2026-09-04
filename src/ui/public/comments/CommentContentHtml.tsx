import { useMemo } from 'react'

import { sanitizeHtml } from '@/ui/lib/sanitize-html'

// Renders the saved comment `content` column (the inkling feed-variant HTML
// projection) — the R13 read path. Sanitization happens at this render
// boundary on both engines (SSR node / hydration DOMPurify); storage keeps
// the raw projection. Pre-R12 rows hold markdown-era text that degrades to
// readable plain text here; the R15 backfill rebuilds their projection.
export function CommentContentHtml({ content, className }: { content: string | null; className?: string }) {
  const clean = useMemo(() => sanitizeHtml(content ?? '', 'body'), [content])
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

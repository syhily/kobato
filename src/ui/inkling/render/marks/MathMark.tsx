import { type ReactNode } from 'react'

import { INKLING_INLINE } from '@/ui/inkling/render/render-shared'
import { cn } from '@/ui/lib/cn'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'

export function renderMathMarkupOrTexFallback(
  tex: string,
  mathml: string | undefined,
  layout: 'inline' | 'display',
): ReactNode {
  if (mathml !== undefined && mathml !== '') {
    if (layout === 'inline') {
      return (
        <span
          className="math-inline inline-block align-middle"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(mathml, 'math') }}
        />
      )
    }
    return (
      <div
        className="math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(mathml, 'math') }}
      />
    )
  }
  if (layout === 'inline') {
    return (
      <span className="math-inline inline-block align-middle">
        <code className={cn(INKLING_INLINE.mathTex)}>{tex}</code>
      </span>
    )
  }
  return (
    <pre className="math math-display">
      <code>{tex}</code>
    </pre>
  )
}

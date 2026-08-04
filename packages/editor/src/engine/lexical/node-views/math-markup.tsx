import type { ReactNode } from 'react'

import { cn } from '@kobato/editor/lib/cn'
import { sanitizeHtml } from '@kobato/editor/lib/sanitize-html'
import { MATH_DISPLAY_CLASS, MATH_INLINE_CLASS, PT_INLINE } from '@kobato/shared/lexical/html-manifest'

/**
 * Shared math markup renderer for the editor node views — the editor-side
 * twin of `renderMathMarkupOrTexFallback` (`@kobato/editor/renderer/
 * render-marks.tsx`): prefers sanitized MathML, then the legacy SVG,
 * then a TeX `<code>` fallback. Class names come from the render
 * manifest, so the in-editor preview matches the public render.
 */

interface MathMarkupProps {
  tex: string
  mathml?: string
  svg?: string
  /** Display (block) vs inline math. */
  display: boolean
  className?: string
}

export function MathMarkup({ tex, mathml, svg, display, className }: MathMarkupProps): ReactNode {
  const markup = mathml !== undefined && mathml !== '' ? mathml : svg
  if (markup !== undefined && markup !== '') {
    return (
      <span
        className={cn(display ? MATH_DISPLAY_CLASS : MATH_INLINE_CLASS, className)}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(markup, 'math') }}
      />
    )
  }
  if (display) {
    return (
      <span className={cn('math math-display', className)}>
        <pre>
          <code>{tex}</code>
        </pre>
      </span>
    )
  }
  return (
    <span className={cn(MATH_INLINE_CLASS, className)}>
      <code className={PT_INLINE.mathTex}>{tex}</code>
    </span>
  )
}

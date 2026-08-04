import { cn } from '@kobato/editor/lib/cn'
import { sanitizeHtml } from '@kobato/editor/lib/sanitize-html'
import { type ReactNode } from 'react'

// Shared math rendering used by the Lexical body renderers (the PT
// renderer's mark components were retired with the PT track; the
// markup-or-TeX fallback survives because the Lexical math nodes carry
// the same prerendered `mathml` / `svg` payloads).
export function renderMathMarkupOrTexFallback(
  tex: string,
  mathml: string | undefined,
  legacySvg: string | undefined,
  layout: 'inline' | 'display',
): ReactNode {
  const markup = mathml !== undefined && mathml !== '' ? mathml : legacySvg
  if (markup !== undefined && markup !== '') {
    if (layout === 'inline') {
      return (
        <span
          className="math-inline inline-block align-middle"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(markup, 'math') }}
        />
      )
    }
    return (
      <div
        className="math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(markup, 'math') }}
      />
    )
  }
  if (layout === 'inline') {
    return (
      <span className="math-inline inline-block align-middle">
        <code className={cn('math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3')}>{tex}</code>
      </span>
    )
  }
  return (
    <pre className="math math-display">
      <code>{tex}</code>
    </pre>
  )
}

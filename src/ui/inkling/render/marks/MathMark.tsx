import { type ReactNode } from 'react'

import { INKLING_INLINE } from '@/ui/inkling/render/render-shared'
import { cn } from '@/ui/lib/cn'

export function renderMathMarkupOrTexFallback(
  tex: string,
  mathml: string | undefined,
  layout: 'inline' | 'display',
): ReactNode {
  // `mathml` is already server-sanitized via `sanitizeMathml`
  // (src/server/render/inkling/sanitize.ts) before it reaches this renderer.
  // No client-side re-sanitization — see
  // docs/superpowers/specs/2026-06-22-sanitizer-migration-design.md §"Why
  // sites 1–4 drop the client-side call entirely".
  if (mathml !== undefined && mathml !== '') {
    if (layout === 'inline') {
      return <span className="math-inline inline-block align-middle" dangerouslySetInnerHTML={{ __html: mathml }} />
    }
    return (
      <div
        className="math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none"
        dangerouslySetInnerHTML={{ __html: mathml }}
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

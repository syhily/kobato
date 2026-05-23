import type { HTMLAttributes } from 'react'

import { cn } from '@/ui/lib/cn'

export type SafeHtmlStrategy = 'shiki' | 'mermaid' | 'math' | 'email' | 'audit' | 'preview' | 'raw'

interface SafeHtmlProps extends Omit<HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML'> {
  html: string
  strategy: SafeHtmlStrategy
  tag?: 'div' | 'span' | 'pre' | 'code' | 'p' | 'td'
}

/**
 * Centralised wrapper for `dangerouslySetInnerHTML`.
 *
 * Every call site must declare a `strategy` that documents why the HTML is
 * considered safe.  The component itself does not perform runtime
 * sanitisation — the safety guarantee comes from the upstream producer
 * (Shiki, KaTeX, Mermaid, the comment-to-html renderer, etc.).  The
 * strategy prop forces authors to think about the threat model and gives
 * reviewers a single audit surface.
 */
export function SafeHtml({ html, strategy, tag = 'div', className, ...rest }: SafeHtmlProps) {
  const Tag = tag
  return (
    <Tag
      className={cn(className)}
      data-safe-html-strategy={strategy}
      // SAFETY: see strategy documentation above.
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
    />
  )
}

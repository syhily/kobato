import { type PortableTextMarkComponentProps } from '@portabletext/react'
import { type ReactNode } from 'react'

import type { FootnoteRefMarkDef, LinkMarkDef, MathInlineMarkDef } from '@/shared/pt/schema'

import { footnoteAnchorHref, footnoteRefId } from '@/shared/pt/footnote-anchors'
import { sanitizeUrl } from '@/shared/sanitize-url'
import { cn } from '@/ui/lib/cn'
import { safeRel } from '@/ui/lib/link'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'
import { FootnoteReference } from '@/ui/pt/Footnotes'
import { PT_INLINE } from '@/ui/pt/render-shared'

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
        <code className={cn(PT_INLINE.mathTex)}>{tex}</code>
      </span>
    )
  }
  return (
    <pre className="math math-display">
      <code>{tex}</code>
    </pre>
  )
}

export function LinkMark({ value, children }: PortableTextMarkComponentProps<LinkMarkDef>) {
  const def = value
  if (def === undefined) {
    return <>{children}</>
  }
  // Defense-in-depth: never emit executable JS or data URLs; `sanitizeUrl` also
  // strips C0 control characters (closes the `java\tscript:` bypass).
  const href = sanitizeUrl(def.href)
  return (
    <a href={href} rel={safeRel(def.target, def.rel)} target={def.target} className={PT_INLINE.link}>
      {children}
    </a>
  )
}

export function MathInlineMarkRenderer({ value, children }: PortableTextMarkComponentProps<MathInlineMarkDef>) {
  const def = value
  if (def === undefined) {
    return <>{children}</>
  }
  return renderMathMarkupOrTexFallback(def.tex, def.mathml, def.svg, 'inline')
}

export function FootnoteRefMarkRenderer({ value, children }: PortableTextMarkComponentProps<FootnoteRefMarkDef>) {
  const def = value
  if (def === undefined) {
    return <>{children}</>
  }
  return (
    <FootnoteReference id={footnoteRefId(def.index)} data-footnote-ref="">
      <a href={footnoteAnchorHref(def.index)} className="footnote-ref">
        {def.index}
      </a>
    </FootnoteReference>
  )
}

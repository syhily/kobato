import { type PortableTextMarkComponentProps } from '@portabletext/react'
import { type ReactNode } from 'react'

import type { FootnoteRefMarkDef, LinkMarkDef, MathInlineMarkDef } from '@/shared/pt/schema'

import { SafeHtml } from '@/ui/components/safe-html'
import { cn } from '@/ui/lib/cn'
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
      return <SafeHtml html={markup} strategy="math" tag="span" className="math-inline inline-block align-middle" />
    }
    return (
      <SafeHtml
        html={markup}
        strategy="math"
        className="math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none"
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
  // Defense-in-depth: even if the schema filter is bypassed, never emit
  // executable JavaScript or data URLs in the public renderer.
  const href = /^\s*(javascript|data):/i.test(def.href) ? '#' : def.href
  return (
    <a href={href} rel={def.rel} target={def.target} className={PT_INLINE.link}>
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
    <FootnoteReference id={`user-content-fnref-${def.index}`} data-footnote-ref="">
      <a href={`#user-content-fn-${def.index}`} className="footnote-ref">
        {def.index}
      </a>
    </FootnoteReference>
  )
}

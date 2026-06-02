import type { HTMLAttributes } from 'react'

import DOMPurify from 'dompurify'

import { cn } from '@/ui/lib/cn'

export type SafeHtmlStrategy = 'shiki' | 'math' | 'email' | 'audit' | 'preview'

interface SafeHtmlProps extends Omit<HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML'> {
  html: string
  strategy: SafeHtmlStrategy
  tag?: 'div' | 'span' | 'pre' | 'code' | 'p' | 'td'
}

/**
 * Centralised wrapper for `dangerouslySetInnerHTML` with runtime
 * sanitisation via DOMPurify.
 *
 * Every call site must declare a `strategy` that documents why the HTML is
 * considered safe.  The strategy controls the DOMPurify allow-list so
 * math SVGs and Shiki-highlighted code each get the minimum required
 * permissions.  This is defence-in-depth: upstream producers (Shiki,
 * KaTeX, etc.) are trusted, but the sanitizer catches any regression or
 * bug that injects unexpected markup.
 */
export function SafeHtml({ html, strategy, tag = 'div', className, ...rest }: SafeHtmlProps) {
  const Tag = tag
  const sanitised = DOMPurify.sanitize(html, strategyToConfig(strategy))
  return (
    <Tag
      className={cn(className)}
      data-safe-html-strategy={strategy}
      // SAFETY: HTML has been run through DOMPurify with a
      // strategy-specific allow-list before injection.
      dangerouslySetInnerHTML={{ __html: sanitised }}
      {...rest}
    />
  )
}

function strategyToConfig(strategy: SafeHtmlStrategy): NonNullable<Parameters<typeof DOMPurify.sanitize>[1]> {
  const base: NonNullable<Parameters<typeof DOMPurify.sanitize>[1]> = {
    ALLOWED_TAGS: [
      'div',
      'span',
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'strong',
      'b',
      'em',
      'i',
      'code',
      'pre',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
    ],
    ALLOWED_ATTR: ['class', 'style', 'href', 'title', 'alt', 'target', 'rel', 'data-*'],
    ALLOW_DATA_ATTR: true,
  }

  switch (strategy) {
    case 'shiki':
      return {
        ...base,
        ALLOWED_TAGS: [...(base.ALLOWED_TAGS ?? []), 'span', 'code', 'pre', 'div', 'line'],
        ALLOWED_ATTR: [
          ...(base.ALLOWED_ATTR ?? []),
          'class',
          'style',
          'data-language',
          'data-rehype-pretty-code-fragment',
          'data-rehype-pretty-code-title',
        ],
      }

    case 'math':
      return {
        ...base,
        ALLOWED_TAGS: [
          ...(base.ALLOWED_TAGS ?? []),
          'math',
          'mrow',
          'mi',
          'mo',
          'mn',
          'msup',
          'msub',
          'msubsup',
          'mfrac',
          'msqrt',
          'mroot',
          'mtext',
          'munder',
          'mover',
          'munderover',
          'mfenced',
          'mstyle',
          'mspace',
          'mpadded',
          'menclose',
          'semantics',
          'annotation',
          'annotation-xml',
          'svg',
          'g',
          'path',
          'rect',
          'circle',
          'ellipse',
          'line',
          'polyline',
          'polygon',
          'text',
          'tspan',
          'defs',
          'use',
          'clipPath',
          'foreignObject',
        ],
        ALLOWED_ATTR: [
          ...(base.ALLOWED_ATTR ?? []),
          'xmlns',
          'display',
          'overflow',
          'mathcolor',
          'mathbackground',
          'mathsize',
          'mathvariant',
          'fence',
          'stretchy',
          'lspace',
          'rspace',
          'maxsize',
          'minsize',
          'movablelimits',
          'accent',
          'accentunder',
          'symmetric',
          'largeop',
          'displaystyle',
          'scriptlevel',
          'columnalign',
          'columnspacing',
          'rowspacing',
          'rowalign',
          'frame',
          'framespacing',
          'width',
          'height',
          'depth',
          'linethickness',
          'bevelled',
          'open',
          'close',
          'separators',
          'notation',
          'subscriptshift',
          'superscriptshift',
          'x',
          'y',
          'x1',
          'y1',
          'x2',
          'y2',
          'cx',
          'cy',
          'r',
          'rx',
          'ry',
          'points',
          'd',
          'fill',
          'stroke',
          'stroke-width',
          'transform',
          'viewBox',
          'preserveAspectRatio',
          'marker',
          'marker-start',
          'marker-end',
          'marker-mid',
          'clip-path',
          'mask',
          'id',
          'href',
          'xlink:href',
        ],
      }

    case 'email':
      return {
        ...base,
        ALLOWED_ATTR: [
          ...(base.ALLOWED_ATTR ?? []),
          'bgcolor',
          'color',
          'align',
          'valign',
          'border',
          'cellpadding',
          'cellspacing',
          'colspan',
          'rowspan',
          'width',
          'height',
          'src',
        ],
      }

    case 'audit':
    case 'preview':
    default:
      return base
  }
}

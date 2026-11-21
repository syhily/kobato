export type SafeHtmlStrategy =
  | 'shiki'
  | 'math'
  | 'email'
  | 'audit'
  | 'preview'
  | 'body'
  | 'feed'
  | 'comment'
  | 'comment-email'

export interface SanitizeStrategyConfig {
  tags: readonly string[]
  attributes: readonly (string | RegExp)[]
  schemes: readonly string[]
  styles?: Readonly<Record<string, readonly RegExp[]>>
  tagAttributes?: Readonly<Record<string, readonly string[]>>
  noProtocolRelative?: boolean
  noopenerOnBlankTarget?: boolean
}

const DATA_ATTR = /^data-.*$/

const BASE_TAGS = [
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
] as const

const BASE_ATTRIBUTES = ['class', 'href', 'title', 'alt', 'target', 'rel', DATA_ATTR] as const

const BASE_SCHEMES = ['http', 'https', 'mailto'] as const

const SHIKI_ALLOWED_STYLES: Readonly<Record<string, readonly RegExp[]>> = {
  color: [/^#?[0-9a-fA-F]+$/, /^rgba?\([^;]*\)$/i, /^hsla?\([^;]*\)$/i, /^inherit$/i, /^var\([^()]*\)$/],
  'background-color': [/^#?[0-9a-fA-F]+$/, /^rgba?\([^;]*\)$/i, /^hsla?\([^;]*\)$/i, /^inherit$/i, /^var\([^()]*\)$/],
  'font-weight': [/^\d{3}$/],
  'font-style': [/^(italic|normal|oblique)$/i],
  'text-decoration': [/^(underline|line-through|none)$/i],
  '--shiki-light': [/^#?[0-9a-fA-F]+$/],
  '--shiki-dark': [/^#?[0-9a-fA-F]+$/],
  '--shiki-light-bg': [/^#?[0-9a-fA-F]+$/],
  '--shiki-dark-bg': [/^#?[0-9a-fA-F]+$/],
}

const MATH_TAGS = [
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
] as const

const MATH_ATTRIBUTES = [
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
] as const

const EMAIL_ATTRIBUTES = [
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
] as const

const COMMENT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'mark',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'sup',
  'sub',
] as const

const BODY_TAGS = ['u', 's', 'sup', 'sub', 'mark', 'figure', 'figcaption', 'section', 'audio', 'svg', 'rect'] as const

const BODY_ATTRIBUTES = [
  'style',
  'src',
  'srcset',
  'sizes',
  'loading',
  'decoding',
  'start',
  'colspan',
  'rowspan',
  'controls',
  'preload',
  'aria-hidden',
  'aria-labelledby',
  'viewbox',
  'fill',
  'stroke',
  'stroke-width',
  'x',
  'y',
] as const

const BODY_ALLOWED_STYLES: Readonly<Record<string, readonly RegExp[]>> = {
  ...SHIKI_ALLOWED_STYLES,
  'text-align': [/^(left|right|center|justify|start|end)$/i],
  'aspect-ratio': [/^\d+\s*\/\s*\d+$/],
}

export function strategyToConfig(strategy: SafeHtmlStrategy): SanitizeStrategyConfig {
  switch (strategy) {
    case 'shiki':
      return {
        tags: [...BASE_TAGS, 'line'],
        attributes: [
          ...BASE_ATTRIBUTES,
          'style',
          'data-language',
          'data-rehype-pretty-code-fragment',
          'data-rehype-pretty-code-title',
        ],
        schemes: BASE_SCHEMES,
        styles: SHIKI_ALLOWED_STYLES,
      }

    case 'math':
      return {
        tags: [...BASE_TAGS, ...MATH_TAGS],
        attributes: [...BASE_ATTRIBUTES, ...MATH_ATTRIBUTES],
        schemes: BASE_SCHEMES,
      }

    case 'email':
      return {
        tags: BASE_TAGS,
        attributes: [...BASE_ATTRIBUTES, ...EMAIL_ATTRIBUTES],
        schemes: BASE_SCHEMES,
      }

    case 'audit':
    case 'preview':
      return {
        tags: BASE_TAGS,
        attributes: BASE_ATTRIBUTES,
        schemes: BASE_SCHEMES,
      }

    case 'body':
      return {
        tags: [...BASE_TAGS, ...BODY_TAGS, ...MATH_TAGS],
        attributes: [...BASE_ATTRIBUTES, ...BODY_ATTRIBUTES, ...MATH_ATTRIBUTES],
        tagAttributes: {
          h1: ['id'],
          h2: ['id'],
          h3: ['id'],
          h4: ['id'],
          h5: ['id'],
          h6: ['id'],
          sup: ['id'],
          li: ['id'],
        },
        schemes: BASE_SCHEMES,
        styles: BODY_ALLOWED_STYLES,
      }

    case 'feed':
      return {
        tags: [
          'p',
          'br',
          'hr',
          'strong',
          'em',
          'u',
          's',
          'mark',
          'code',
          'pre',
          'blockquote',
          'ul',
          'ol',
          'li',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'a',
          'img',
          'sup',
          'sub',
          'figure',
          'figcaption',
          'audio',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'section',
          'div',
        ],
        attributes: [
          'id',
          'class',
          'data-language',
          'data-footnotes',
          'data-footnote-backref',
          'aria-labelledby',
          'aria-label',
        ],
        tagAttributes: {
          a: ['href', 'title', 'name', 'rel', 'target'],
          img: ['src', 'alt', 'title', 'width', 'height'],
          audio: ['src', 'controls', 'preload'],
        },
        schemes: BASE_SCHEMES,
        noProtocolRelative: true,
        noopenerOnBlankTarget: true,
      }

    case 'comment-email':
      return {
        tags: COMMENT_TAGS,
        attributes: ['class'],
        tagAttributes: {
          a: ['href', 'title', 'rel', 'target'],
        },
        schemes: BASE_SCHEMES,
        noProtocolRelative: true,
      }

    case 'comment':
      return {
        tags: COMMENT_TAGS,
        attributes: ['class'],
        tagAttributes: {
          a: ['href', 'title', 'rel', 'target'],
        },
        schemes: BASE_SCHEMES,
        noProtocolRelative: true,
        noopenerOnBlankTarget: true,
      }
  }
}

import sanitizeHtml, { type AllowedAttribute, type IOptions } from 'sanitize-html'

export type SafeHtmlStrategy = 'shiki' | 'math' | 'email' | 'audit' | 'preview'

// `data-*` attributes drive Tiptap, Base UI, and shiki state on inline
// nodes in the admin editor. The sanitize-html typings don't expose
// RegExp in `AllowedAttribute`, but the runtime matcher accepts it.
// eslint-disable-next-line ts/no-unsafe-type-assertion
const DATA_ATTR: AllowedAttribute = /^data-.*$/ as unknown as AllowedAttribute

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
]

const BASE_ATTRIBUTES: Record<string, AllowedAttribute[]> = {
  '*': ['class', 'href', 'title', 'alt', 'target', 'rel', DATA_ATTR],
}

const BASE_SCHEMES = ['http', 'https', 'mailto']

// Shiki's syntax highlighter emits inline `style="color:#…"` on every
// token span. We restrict the allow-list to the property/value shapes
// shiki actually produces so an attacker can't smuggle in
// `expression()` / `url(javascript:)` / etc. via a hand-crafted PT body.
const SHIKI_ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  '*': {
    color: [/^#?[0-9a-fA-F]+$/, /^rgba?\([^;]*\)$/i, /^hsla?\([^;]*\)$/i, /^inherit$/i, /^var\(/],
    'background-color': [/^#?[0-9a-fA-F]+$/, /^rgba?\([^;]*\)$/i, /^hsla?\([^;]*\)$/i, /^inherit$/i, /^var\(/],
    'font-weight': [/^\d{3}$/],
    'font-style': [/^(italic|normal|oblique)$/i],
    'text-decoration': [/^(underline|line-through|none)$/i],
    '--shiki-light': [/^#?[0-9a-fA-F]+$/],
    '--shiki-dark': [/^#?[0-9a-fA-F]+$/],
    '--shiki-light-bg': [/^#?[0-9a-fA-F]+$/],
    '--shiki-dark-bg': [/^#?[0-9a-fA-F]+$/],
  },
}

function strategyToConfig(strategy: SafeHtmlStrategy): IOptions {
  switch (strategy) {
    case 'shiki':
      return {
        allowedTags: [...BASE_TAGS, 'line'],
        allowedAttributes: {
          '*': [
            ...BASE_ATTRIBUTES['*']!,
            'style',
            'data-language',
            'data-rehype-pretty-code-fragment',
            'data-rehype-pretty-code-title',
          ],
        },
        allowedSchemes: BASE_SCHEMES,
        allowedStyles: SHIKI_ALLOWED_STYLES,
      }

    case 'math':
      return {
        allowedTags: [
          ...BASE_TAGS,
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
        ],
        allowedAttributes: {
          '*': [
            ...BASE_ATTRIBUTES['*']!,
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
          ],
        },
        allowedSchemes: BASE_SCHEMES,
      }

    case 'email':
      return {
        allowedTags: BASE_TAGS,
        allowedAttributes: {
          '*': [
            ...BASE_ATTRIBUTES['*']!,
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
        },
        allowedSchemes: BASE_SCHEMES,
      }

    case 'audit':
    case 'preview':
    default:
      return {
        allowedTags: BASE_TAGS,
        allowedAttributes: BASE_ATTRIBUTES,
        allowedSchemes: BASE_SCHEMES,
      }
  }
}

export function sanitizeHtmlString(html: string, strategy: SafeHtmlStrategy): string {
  return sanitizeHtml(html, strategyToConfig(strategy))
}

export { sanitizeHtmlString as sanitizeHtml }

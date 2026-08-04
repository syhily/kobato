// Strategy data for `sanitizeHtmlString`, shared by the two engine
// implementations (sanitize-html on the server, DOMPurify in the browser).
// Keep this module dependency-free so both engines and the facade can
// import it in either bundle.

export type SafeHtmlStrategy = 'shiki' | 'math' | 'email' | 'audit' | 'preview'

export interface SanitizeStrategyConfig {
  tags: readonly string[]
  attributes: readonly (string | RegExp)[]
  schemes: readonly string[]
  /** Per-property CSS allowlist (shiki only); values must match one pattern. */
  styles?: Readonly<Record<string, readonly RegExp[]>>
}

// `data-*` attributes drive Lexical, Base UI, and shiki state on inline
// nodes in the admin editor.
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

// Shiki's syntax highlighter emits inline `style="color:#…"` on every
// token span. We restrict the allow-list to the property/value shapes
// shiki actually produces so an attacker can't smuggle in
// `expression()` / `url(javascript:)` / etc. via a hand-crafted PT body.
const SHIKI_ALLOWED_STYLES: Readonly<Record<string, readonly RegExp[]>> = {
  color: [/^#?[0-9a-fA-F]+$/, /^rgba?\([^;]*\)$/i, /^hsla?\([^;]*\)$/i, /^inherit$/i, /^var\(/],
  'background-color': [/^#?[0-9a-fA-F]+$/, /^rgba?\([^;]*\)$/i, /^hsla?\([^;]*\)$/i, /^inherit$/i, /^var\(/],
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
    default:
      return {
        tags: BASE_TAGS,
        attributes: BASE_ATTRIBUTES,
        schemes: BASE_SCHEMES,
      }
  }
}

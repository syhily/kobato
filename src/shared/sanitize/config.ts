// Strategy data shared by the two sanitize engines. Dependency-free so both
// engines and the facade can import it in either bundle.

export type SafeHtmlStrategy = 'shiki' | 'math' | 'email' | 'audit' | 'preview' | 'body' | 'feed' | 'comment-email'

export interface SanitizeStrategyConfig {
  tags: readonly string[]
  attributes: readonly (string | RegExp)[]
  schemes: readonly string[]
  /** Per-property CSS allowlist (shiki + body); values must match one pattern. */
  styles?: Readonly<Record<string, readonly RegExp[]>>
  /**
   * Per-tag attribute allowlist ADDED on top of the global `attributes` list
   * (sanitize-html's `allowedAttributes` shape): the DOMPurify ALLOWED_ATTR
   * gets the union, and a hook narrows non-global attributes back down by
   * tagName so e.g. `src` survives on <img> but not on <p>.
   */
  tagAttributes?: Readonly<Record<string, readonly string[]>>
  /**
   * Reject protocol-relative URLs (`//host/path`) — swaps in a stricter URI
   * regexp with a `(?!\/\/)` negative lookahead (sanitize-html's
   * `allowProtocolRelative: false`).
   */
  noProtocolRelative?: boolean
  /**
   * Rewrite rel="noopener noreferrer nofollow" on every <a target="_blank">
   * (sanitize-html's transformTags overwrite semantics: the whole rel value
   * is replaced, not merged).
   */
  noopenerOnBlankTarget?: boolean
}

// `data-*` attributes drive Tiptap, Base UI, and shiki state on inline nodes.
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

// Restricted to the property/value shapes shiki actually emits, so a hand-crafted
// body can't smuggle in `expression()` / `url(javascript:)` etc.
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

// inkling `exportDOM` additions over BASE: inline marks (u/s/sup/sub/mark),
// media wrappers (figure/figcaption/audio), the footnotes <section>, and the
// solution card's inline SVG QED mark. `viewbox` matches sanitize-html's
// lowercased attribute names AND DOMPurify's case-insensitive check against
// the HTML parser's camelCase-adjusted SVG attributes.
const BODY_TAGS = ['u', 's', 'sup', 'sub', 'mark', 'figure', 'figcaption', 'section', 'audio', 'svg', 'rect'] as const

const BODY_ATTRIBUTES = [
  'id',
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

// Code blocks keep shiki's inline colors; paragraphs/headings add text-align;
// images add aspect-ratio placeholders. Anything else (position, url(), …) dies.
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

    // SSR/hydration boundary for the saved `body_html` projection (inkling
    // exportDOM) and comment `content` (its feed variant). Everything inkling
    // exports survives: data-* hooks, figure/img srcset + thumbhash, KaTeX
    // MathML, footnote anchors, host-card markup, shiki code spans.
    case 'body':
      return {
        tags: [...BASE_TAGS, ...BODY_TAGS, ...MATH_TAGS],
        attributes: [...BASE_ATTRIBUTES, ...BODY_ATTRIBUTES, ...MATH_ATTRIBUTES],
        schemes: BASE_SCHEMES,
        styles: BODY_ALLOWED_STYLES,
      }

    // Server-only boundary for feed XML output (`render/feed/generator`).
    // The tag set mirrors the feed-variant projection's real output
    // (`infra/pt/lexical-projection` — inkling exportDOM, artifacts stripped):
    // inline marks strong/em/u/s/code/mark, sup/sub footnote refs, the
    // footnotes <section>, media figure/figcaption/audio, and the table
    // family. `id` on `*` covers headings, footnote anchors, and the
    // footnotes section. img's data: scheme rides DOMPurify's default
    // DATA_URI_TAGS (sanitize-html's allowedSchemesByTag equivalent).
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

    // Server-only boundary for the comment `content` column at the email
    // boundary (`domains/comments/services/email`). Tags mirror the comment
    // feed-variant projection's real output: paragraphs, inline marks
    // (inkling exportDOM: strong/em/u/s/mark/code, sup/sub), blockquote,
    // lists, plain pre/code (artifacts stripped), and links.
    case 'comment-email':
      return {
        tags: [
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
        ],
        attributes: ['class'],
        tagAttributes: {
          a: ['href', 'title', 'rel', 'target'],
        },
        schemes: BASE_SCHEMES,
        noProtocolRelative: true,
      }
  }
}

import sanitizeHtml from 'sanitize-html'

// Feed-safe sanitizer for Inkling HTML output. The allow-list mirrors the
// policy used for PortableText feed rendering so both pipelines produce
// comparable syndication output.
export function sanitizeInklingFeedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'hr',
      'strong',
      'em',
      'u',
      's',
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
    allowedAttributes: {
      a: ['href', 'title', 'name', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      audio: ['src', 'controls', 'preload'],
      // `id` is emitted by headings, footnote anchors, and the footnotes section.
      '*': ['id', 'class', 'data-language', 'data-footnotes', 'data-footnote-backref', 'aria-labelledby', 'aria-label'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    disallowedTagsMode: 'discard',
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) =>
        attribs.target === '_blank'
          ? { tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer nofollow' } }
          : { tagName: 'a', attribs },
    },
  })
}

/**
 * Sanitize server-rendered mathml HTML before emitting it in SSR output.
 * This is the authoritative sanitization boundary — the client no longer
 * re-sanitizes mathml (see
 * `docs/superpowers/specs/2026-06-22-sanitizer-migration-design.md`).
 */
export function sanitizeMathml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
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
      // NOTE: `annotation-xml` is intentionally excluded from the allow-list.
      // `<annotation-xml encoding="text/html">` is the canonical mutation-XSS
      // / namespace-switching vector used to break out of MathML into the
      // HTML namespace and smuggle `<script>` or event handlers (this is why
      // DOMPurify special-cases it). KaTeX's own MathML output (generated
      // with `trust: false`) does not need `annotation-xml` for rendering —
      // it only carries a hidden TeX source annotation. Dropping the tag
      // entirely closes the mXSS vector regardless of what an
      // attacker-controlled TeX payload produces.
      'span',
      'div',
    ],
    allowedAttributes: {
      '*': [
        'class',
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
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  })
}

/**
 * Sanitize server-rendered shiki-highlighted code HTML before emitting it
 * in SSR output.  Shiki emits inline `style="color:…"` on token spans; we
 * restrict the allow-list to the property/value shapes shiki actually
 * produces.  This is the authoritative sanitization boundary — the client
 * no longer re-sanitizes shiki output (see
 * `docs/superpowers/specs/2026-06-22-sanitizer-migration-design.md`).
 */
export function sanitizeShikiHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['code', 'pre', 'span', 'line', 'div'],
    allowedAttributes: {
      '*': [
        'class',
        'style',
        'data-language',
        'data-rehype-pretty-code-fragment',
        'data-rehype-pretty-code-title',
        'data-line',
      ],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedStyles: {
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
    },
  })
}

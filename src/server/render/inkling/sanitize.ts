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

import { describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { extractExternalLinks, MAX_OUTBOUND_LINKS_PER_POST } from '@/server/domains/webmentions/enqueue'

const SITE_HOST = 'example.com'

function linkNode(url: string, text = 'body') {
  return {
    type: 'link',
    version: 1,
    url,
    rel: null,
    target: null,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }],
  }
}

function autolinkNode(url: string) {
  return {
    type: 'autolink',
    version: 1,
    url,
    rel: null,
    target: null,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: url }],
  }
}

function paragraphWith(children: unknown[]) {
  return { type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children }
}

describe('webmentions/enqueue.extractExternalLinks', () => {
  it('extracts link node URLs across blocks', () => {
    const body = lexicalBodyWith([
      paragraphWith([linkNode('https://a.dev/one')]),
      paragraphWith([linkNode('https://b.dev/two')]),
    ])
    expect(extractExternalLinks(body, SITE_HOST)).toEqual(['https://a.dev/one', 'https://b.dev/two'])
  })

  it('extracts autolink node URLs too (a rendered autolink is a real outbound <a>)', () => {
    const body = lexicalBodyWith([paragraphWith([autolinkNode('https://auto.dev/page')])])
    expect(extractExternalLinks(body, SITE_HOST)).toEqual(['https://auto.dev/page'])
  })

  it('excludes links back to the site itself', () => {
    const body = lexicalBodyWith([
      paragraphWith([linkNode('https://example.com/posts/hello'), linkNode('https://a.dev/one')]),
    ])
    expect(extractExternalLinks(body, SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('drops non-http(s) URLs (mailto, anchors, relative)', () => {
    const body = lexicalBodyWith([
      paragraphWith([
        linkNode('mailto:a@b.c'),
        linkNode('#frag'),
        linkNode('/local/path'),
        linkNode('https://a.dev/one'),
      ]),
    ])
    expect(extractExternalLinks(body, SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('normalizes and dedupes (fragment, default port, trailing slash)', () => {
    const body = lexicalBodyWith([
      paragraphWith([linkNode('https://a.dev/one/#section')]),
      paragraphWith([linkNode('https://a.dev:443/one'), autolinkNode('https://a.dev/one/')]),
    ])
    expect(extractExternalLinks(body, SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('ignores non-link nodes and link nodes without a string url', () => {
    const body: LexicalEditorState = lexicalBodyWith([
      lexicalParagraph('plain text'),
      paragraphWith([
        { type: 'link', version: 1, direction: 'ltr', format: '', indent: 0, children: [] },
        linkNode('https://a.dev/one'),
      ]),
    ])
    expect(extractExternalLinks(body, SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('caps the extraction at the per-post maximum', () => {
    const nodes = Array.from({ length: MAX_OUTBOUND_LINKS_PER_POST + 10 }, (_, i) => linkNode(`https://a.dev/${i}`))
    const body = lexicalBodyWith([paragraphWith(nodes)])
    expect(extractExternalLinks(body, SITE_HOST)).toHaveLength(MAX_OUTBOUND_LINKS_PER_POST)
  })
})

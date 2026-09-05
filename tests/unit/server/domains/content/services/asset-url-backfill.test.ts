import { describe, expect, it } from 'vitest'

import type { ImageBlock, PortableTextBody } from '@/shared/pt/schema'

import { lexicalBodyWith, lexicalImage } from '#/_helpers/lexical'
import {
  rewriteAssetReference,
  rewriteBodyAssetUrls,
  rewriteLexicalBodyAssetUrls,
} from '@/server/domains/content/services/asset-url-backfill'

const CDN = 'https://cdn.example.com'

function img(overrides: Partial<ImageBlock> & { _key: string }): ImageBlock {
  return { _type: 'image', src: '', ...overrides } as ImageBlock
}

describe('rewriteBodyAssetUrls', () => {
  it('re-stamps a block carrying storagePath regardless of the baked host', () => {
    const body = [img({ _key: 'a', src: 'https://old-cdn.example/images/x.jpg', storagePath: 'images/x.jpg' })]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect(changed).toBe(true)
    expect((body[0] as ImageBlock).src).toBe('/storage/images/x.jpg')
  })

  it('rewrites a storagePath-less block whose src matches the current CDN base', () => {
    const body = [img({ _key: 'a', src: `${CDN}/images/x.jpg` })]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect(changed).toBe(true)
    expect((body[0] as ImageBlock).src).toBe('/storage/images/x.jpg')
  })

  it('strips a CDN transform suffix when rewriting', () => {
    const body = [img({ _key: 'a', src: `${CDN}/images/x.jpg!upyun520/both/300x300` })]
    rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect((body[0] as ImageBlock).src).toBe('/storage/images/x.jpg')
  })

  it('rewrites any-origin absolute /storage/ srcs (domain moves)', () => {
    const body = [img({ _key: 'a', src: 'https://old-blog.example/storage/images/x.jpg?v=1' })]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, null)
    expect(changed).toBe(true)
    expect((body[0] as ImageBlock).src).toBe('/storage/images/x.jpg')
  })

  it('leaves the already-rewritten form untouched (idempotent)', () => {
    const body = [img({ _key: 'a', src: '/storage/images/x.jpg' })]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect(changed).toBe(false)
    expect((body[0] as ImageBlock).src).toBe('/storage/images/x.jpg')
  })

  it('drops a baked ?v= cache-buster on the origin-relative form', () => {
    const body = [img({ _key: 'a', src: '/storage/images/x.jpg?v=1' })]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect(changed).toBe(true)
    expect((body[0] as ImageBlock).src).toBe('/storage/images/x.jpg')
  })

  it('leaves truly external images alone', () => {
    const body = [img({ _key: 'a', src: 'https://flickr.example/photos/x.jpg' })]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect(changed).toBe(false)
    expect((body[0] as ImageBlock).src).toBe('https://flickr.example/photos/x.jpg')
  })

  it('never rewrites the ambiguous /images/ form (first-party site routes share the prefix)', () => {
    const body = [
      img({ _key: 'a', src: '/images/og/posts/hello.png' }),
      img({ _key: 'b', src: 'images/default-music-cover.png' }),
      img({ _key: 'c', src: 'https://old-blog.example/images/calendar/2026.png' }),
    ]
    const { changed } = rewriteBodyAssetUrls(body as PortableTextBody, CDN)
    expect(changed).toBe(false)
    expect(body.map((b) => (b as ImageBlock).src)).toEqual([
      '/images/og/posts/hello.png',
      'images/default-music-cover.png',
      'https://old-blog.example/images/calendar/2026.png',
    ])
  })

  it('reaches image blocks nested in solution / twoColumn / footnoteDefinition containers', () => {
    const body = [
      {
        _type: 'solution',
        _key: 's1',
        children: [img({ _key: 'n1', src: `${CDN}/images/a.jpg` })],
      },
      {
        _type: 'twoColumn',
        _key: 't1',
        left: [img({ _key: 'n2', src: `${CDN}/images/b.jpg` })],
        right: [img({ _key: 'n3', src: `${CDN}/images/c.jpg`, storagePath: 'images/c.jpg' })],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'f1',
        index: 1,
        children: [img({ _key: 'n4', src: `${CDN}/images/d.jpg` })],
      },
    ]
    const { changed } = rewriteBodyAssetUrls(body as unknown as PortableTextBody, CDN)
    expect(changed).toBe(true)
    const [solution, twoColumn, footnote] = body as unknown as {
      children?: ImageBlock[]
      left?: ImageBlock[]
      right?: ImageBlock[]
    }[]
    expect(solution.children![0]!.src).toBe('/storage/images/a.jpg')
    expect(twoColumn.left![0]!.src).toBe('/storage/images/b.jpg')
    expect(twoColumn.right![0]!.src).toBe('/storage/images/c.jpg')
    expect(footnote.children![0]!.src).toBe('/storage/images/d.jpg')
  })

  it('ignores non-image blocks', () => {
    const body = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: `${CDN}/images/x.jpg`, marks: [] }],
      },
    ]
    const { changed } = rewriteBodyAssetUrls(body as unknown as PortableTextBody, CDN)
    expect(changed).toBe(false)
  })
})

describe('rewriteLexicalBodyAssetUrls', () => {
  function firstSrc(state: ReturnType<typeof lexicalBodyWith>): string {
    return (state.root.children[0] as unknown as { src: string }).src
  }

  it('re-stamps an image node carrying storagePath regardless of the baked host', () => {
    const state = lexicalBodyWith([
      lexicalImage({ src: 'https://old-cdn.example/images/x.jpg', storagePath: 'images/x.jpg' }),
    ])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(true)
    expect(firstSrc(state)).toBe('/storage/images/x.jpg')
  })

  it('rewrites a storagePath-less image node whose src matches the current CDN base', () => {
    const state = lexicalBodyWith([lexicalImage({ src: `${CDN}/images/x.jpg`, storagePath: '' })])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(true)
    expect(firstSrc(state)).toBe('/storage/images/x.jpg')
  })

  it('strips a CDN transform suffix when rewriting', () => {
    const state = lexicalBodyWith([lexicalImage({ src: `${CDN}/images/x.jpg!upyun520/both/300x300` })])
    rewriteLexicalBodyAssetUrls(state, CDN)
    expect(firstSrc(state)).toBe('/storage/images/x.jpg')
  })

  it('rewrites any-origin absolute /storage/ srcs (domain moves)', () => {
    const state = lexicalBodyWith([lexicalImage({ src: 'https://old-blog.example/storage/images/x.jpg?v=1' })])
    const { changed } = rewriteLexicalBodyAssetUrls(state, null)
    expect(changed).toBe(true)
    expect(firstSrc(state)).toBe('/storage/images/x.jpg')
  })

  it('leaves the already-rewritten form untouched (idempotent)', () => {
    const state = lexicalBodyWith([lexicalImage({ src: '/storage/images/x.jpg', storagePath: 'images/x.jpg' })])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(false)
    expect(firstSrc(state)).toBe('/storage/images/x.jpg')
  })

  it('drops a baked ?v= cache-buster on the origin-relative form', () => {
    const state = lexicalBodyWith([lexicalImage({ src: '/storage/images/x.jpg?v=1' })])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(true)
    expect(firstSrc(state)).toBe('/storage/images/x.jpg')
  })

  it('leaves truly external images alone', () => {
    const state = lexicalBodyWith([lexicalImage({ src: 'https://flickr.example/photos/x.jpg' })])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(false)
    expect(firstSrc(state)).toBe('https://flickr.example/photos/x.jpg')
  })

  it('never rewrites the ambiguous /images/ form (first-party site routes share the prefix)', () => {
    const state = lexicalBodyWith([lexicalImage({ src: '/images/og/posts/hello.png' })])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(false)
    expect(firstSrc(state)).toBe('/images/og/posts/hello.png')
  })

  it('reaches image nodes nested under element children', () => {
    const state = lexicalBodyWith([
      {
        type: 'quote',
        version: 1,
        children: [lexicalImage({ src: `${CDN}/images/deep.jpg` })],
        direction: 'ltr',
        format: '',
        indent: 0,
      },
    ])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(true)
    const quote = state.root.children[0] as unknown as { children: { src: string }[] }
    expect(quote.children[0]!.src).toBe('/storage/images/deep.jpg')
  })

  it('rewrites img srcs inside solution / two-column / footnotedefinition dataset HTML', () => {
    const state = lexicalBodyWith([
      {
        type: 'solution',
        version: 1,
        content: `<p>hint</p><figure><img src="${CDN}/images/a.jpg" alt="a" /><img src="https://external.example/x.jpg" alt="x" /></figure>`,
      },
      {
        type: 'two-column',
        version: 1,
        left: `<figure><img src="${CDN}/images/b.jpg!upyun520/both/300x300" alt="b" /></figure>`,
        right: `<figure><img src="https://old-blog.example/storage/images/c.jpg?v=2" alt="c" /></figure>`,
      },
      {
        type: 'footnotedefinition',
        version: 1,
        content: `<p><img src="${CDN}/images/d.jpg" alt="d" /></p>`,
        targetKey: 'f1',
        index: 1,
      },
    ])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(true)
    const [solution, twoColumn, footnote] = state.root.children as unknown as {
      content?: string
      left?: string
      right?: string
    }[]
    expect(solution.content).toContain('src="/storage/images/a.jpg"')
    // Truly external markup stays untouched.
    expect(solution.content).toContain('src="https://external.example/x.jpg"')
    expect(twoColumn.left).toContain('src="/storage/images/b.jpg"')
    expect(twoColumn.right).toContain('src="/storage/images/c.jpg"')
    expect(footnote.content).toContain('src="/storage/images/d.jpg"')
  })

  it('unescapes the attribute before matching and re-escapes the rewrite (query rides along, PT parity)', () => {
    const state = lexicalBodyWith([
      {
        type: 'solution',
        version: 1,
        content: `<figure><img src="${CDN}/images/a.jpg?v=1&amp;dit=2" alt="a" /></figure>`,
      },
    ])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(true)
    expect((state.root.children[0] as unknown as { content: string }).content).toContain(
      'src="/storage/images/a.jpg?v=1&amp;dit=2"',
    )
  })

  it('leaves dataset HTML without rewritable imgs untouched', () => {
    const state = lexicalBodyWith([
      { type: 'solution', version: 1, content: '<p>plain text</p>' },
      {
        type: 'two-column',
        version: 1,
        left: '<figure><img src="https://external.example/x.jpg" alt="x" /></figure>',
        right: '',
      },
      { type: 'music-player', version: 1, playerId: 'p1', cover: `${CDN}/music/cover.png` },
    ])
    const { changed } = rewriteLexicalBodyAssetUrls(state, CDN)
    expect(changed).toBe(false)
  })
})

describe('rewriteAssetReference', () => {
  it('rewrites the current CDN base form', () => {
    expect(rewriteAssetReference(`${CDN}/images/cover.jpg`, CDN)).toBe('/storage/images/cover.jpg')
  })

  it('rewrites any-origin absolute /storage/ forms', () => {
    expect(rewriteAssetReference('https://moved.example/storage/images/cover.jpg', CDN)).toBe(
      '/storage/images/cover.jpg',
    )
  })

  it('returns null for the already-rewritten form', () => {
    expect(rewriteAssetReference('/storage/images/cover.jpg', CDN)).toBeNull()
  })

  it('returns null for empty, external, and ambiguous /images/ URLs', () => {
    expect(rewriteAssetReference('', CDN)).toBeNull()
    expect(rewriteAssetReference('https://friend.example/poster.jpg', CDN)).toBeNull()
    expect(rewriteAssetReference('/images/open-graph.png', CDN)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import type { ImageBlock, PortableTextBody } from '@/shared/pt/schema'

import { rewriteAssetReference, rewriteBodyAssetUrls } from '@/server/domains/content/services/asset-url-backfill'

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

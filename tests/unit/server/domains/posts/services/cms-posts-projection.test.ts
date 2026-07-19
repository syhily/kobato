import { describe, expect, it } from 'vitest'

import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'

// Projection-layer unit tests for post DTO shaping.  Pins two contracts:
//
//   1. `toCmsPost` / `toClientPostFromMeta` fall back to the default cover
//      image (`/images/open-graph.png`) when the DB `cover` column is empty.
//      This prevents broken `<Image src="" />` renders in listings and
//      failed OG generation.
//   2. DTO field shape stability (id stringification, permalink, dates).

const { toCmsPost } = await import('@/server/domains/posts/projection')
const { toClientPostFromMeta } = await import('@/server/domains/posts/repos/shared')

function metaRow(overrides: Partial<PostMetaRow> = {}): PostMetaRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 1n,
    slug: overrides.slug ?? 'hello',
    title: overrides.title ?? 'Hello',
    summary: overrides.summary ?? '',
    cover: overrides.cover ?? '',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    showToc: overrides.showToc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    visible: overrides.visible ?? true,
    publishedAt: overrides.publishedAt ?? now,
    publishedRevisionId: overrides.publishedRevisionId ?? null,
    firstPublishedAt: overrides.firstPublishedAt ?? null,
    authorId: overrides.authorId ?? null,
    categoryId: overrides.categoryId ?? 1n,
    alias: overrides.alias ?? [],
    pinnedAt: overrides.pinnedAt ?? null,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
  }
}

function contentRow(overrides: Partial<ContentRow> = {}): ContentRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 100n,
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? 1n,
    revisionNo: overrides.revisionNo ?? 1,
    status: overrides.status ?? 'draft',
    body: overrides.body ?? [],
    imageSources: overrides.imageSources ?? [],
    headings: overrides.headings ?? [],
    authorId: overrides.authorId ?? null,
    clientRevisionToken: overrides.clientRevisionToken ?? '00000000-0000-0000-0000-000000000001',
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

describe('cms/posts/projection — toCmsPost', () => {
  it('falls back to the default cover image when cover is empty', () => {
    const dto = toCmsPost(metaRow({ cover: '' }), null)
    expect(dto.cover).toBe('/images/open-graph.png')
  })

  it('preserves a non-empty cover as-is', () => {
    const dto = toCmsPost(metaRow({ cover: '/images/custom.jpg' }), null)
    expect(dto.cover).toBe('/images/custom.jpg')
  })

  it('returns an empty body when there is no published revision', () => {
    const dto = toCmsPost(metaRow({ publishedRevisionId: null }), null)
    expect(dto.body).toEqual([])
    expect(dto.imageSources).toEqual([])
    expect(dto.headings).toEqual([])
    expect(dto.permalink).toBe('/posts/hello')
  })

  it('projects the resolved category name and defaults to an empty string', () => {
    expect(toCmsPost(metaRow({ categoryId: 5n }), null, { categoryName: 'Tech' }).category).toBe('Tech')
    expect(toCmsPost(metaRow({ categoryId: null }), null).category).toBe('')
  })

  it('joins the published revision body when present', () => {
    const body = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: 'Hi' }],
      },
    ]
    const dto = toCmsPost(
      metaRow({ publishedRevisionId: 200n }),
      contentRow({
        id: 200n,
        body,
        imageSources: ['images/x.jpg'],
        headings: [{ depth: 2, text: 'Hi', slug: 'hi' }],
      }),
    )
    expect(dto.body).toEqual(body)
    expect(dto.imageSources).toEqual(['images/x.jpg'])
    expect(dto.headings).toEqual([{ depth: 2, text: 'Hi', slug: 'hi' }])
  })
})

describe('cms/posts/projection — toClientPostFromMeta', () => {
  it('falls back to the default cover image when cover is empty', () => {
    const dto = toClientPostFromMeta(metaRow({ cover: '' }))
    expect(dto.cover).toBe('/images/open-graph.png')
  })

  it('preserves a non-empty cover as-is', () => {
    const dto = toClientPostFromMeta(metaRow({ cover: '/images/custom.jpg' }))
    expect(dto.cover).toBe('/images/custom.jpg')
  })

  it('stringifies the bigint id and builds the permalink', () => {
    const dto = toClientPostFromMeta(metaRow({ id: 42n, slug: 'test-post' }))
    expect(dto.id).toBe('42')
    expect(dto.permalink).toBe('/posts/test-post')
  })
})

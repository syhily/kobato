import { afterEach } from 'vitest'

import type { AdminPostDto } from '@/shared/contracts/posts'
import type { ClientCategory, ClientPage, ClientPost, ClientTag } from '@/shared/types/catalog'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

// Post / page ids are numeric strings (stringified bigints from the DB).
// Tests can mostly pin them but the detail loader now `Number(post.id)`s
// the value to build the metric target, so generated ids MUST be numeric.
let idCounter = 1_000_000
function nextNumericId(): string {
  idCounter += 1
  return String(idCounter)
}

export function makeTag(overrides: Partial<ClientTag> = {}): ClientTag {
  const slug = overrides.slug ?? nextId('tag')
  return {
    name: overrides.name ?? slug,
    slug,
    counts: overrides.counts ?? 1,
    permalink: overrides.permalink ?? `/tags/${slug}`,
  }
}

export function makeCategory(overrides: Partial<ClientCategory> = {}): ClientCategory {
  const slug = overrides.slug ?? nextId('category')
  return {
    name: overrides.name ?? slug,
    slug,
    cover: overrides.cover ?? '/images/cover.png',
    description: overrides.description ?? '',
    counts: overrides.counts ?? 1,
    permalink: overrides.permalink ?? `/cats/${slug}`,
    ...overrides,
  }
}

export function makePost(overrides: Partial<ClientPost> = {}): ClientPost {
  const slug = overrides.slug ?? nextId('post')
  return {
    id: overrides.id ?? nextNumericId(),
    title: overrides.title ?? `Post ${slug}`,
    date: overrides.date ?? new Date('2024-01-01T00:00:00.000Z'),
    comments: overrides.comments ?? true,
    alias: overrides.alias ?? [],
    tags: overrides.tags ?? [],
    category: overrides.category ?? 'general',
    summary: overrides.summary ?? 'summary',
    cover: overrides.cover ?? '/images/cover.png',
    published: overrides.published ?? true,
    visible: overrides.visible ?? true,
    toc: overrides.toc ?? true,
    showUpdated: overrides.showUpdated ?? false,
    slug,
    permalink: overrides.permalink ?? `/posts/${slug}`,
    headings: overrides.headings ?? [],
    ...overrides,
  }
}

export function makePage(overrides: Partial<ClientPage> = {}): ClientPage {
  const slug = overrides.slug ?? nextId('page')
  return {
    id: overrides.id ?? nextNumericId(),
    title: overrides.title ?? `Page ${slug}`,
    date: overrides.date ?? new Date('2024-01-01T00:00:00.000Z'),
    comments: overrides.comments ?? false,
    cover: overrides.cover ?? '/images/cover.png',
    published: overrides.published ?? true,
    summary: overrides.summary ?? '',
    toc: overrides.toc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    showFriends: overrides.showFriends ?? false,
    slug,
    permalink: overrides.permalink ?? `/${slug}`,
    headings: overrides.headings ?? [],
    ...overrides,
  }
}

export function makeAdminPost(overrides: Partial<AdminPostDto> = {}): AdminPostDto {
  const slug = overrides.slug ?? nextId('admin-post')
  return {
    id: overrides.id ?? nextNumericId(),
    slug,
    title: overrides.title ?? `Admin Post ${slug}`,
    summary: overrides.summary ?? 'summary',
    cover: overrides.cover ?? '/images/cover.png',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    showToc: overrides.showToc ?? true,
    showUpdated: overrides.showUpdated ?? false,
    visible: overrides.visible ?? true,
    publishedAt: overrides.publishedAt ?? '2024-01-01T00:00:00.000Z',
    publishedRevisionId: overrides.publishedRevisionId ?? 'revision-1',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    category: overrides.category ?? 'general',
    categoryId: overrides.categoryId ?? '1',
    tags: overrides.tags ?? [],
    alias: overrides.alias ?? [],
    authorId: overrides.authorId ?? null,
    authorName: overrides.authorName ?? 'author',
    pinnedAt: overrides.pinnedAt ?? null,
    firstPublishedAt: overrides.firstPublishedAt ?? '2024-01-01T00:00:00.000Z',
    commentCount: overrides.commentCount ?? 0,
    commentPublicId: overrides.commentPublicId ?? '',
    ...overrides,
  }
}

export function resetCatalogIds(): void {
  counter = 0
  idCounter = 1_000_000
}

afterEach(() => {
  resetCatalogIds()
})

export function makePostList(count: number, overrides: Partial<ClientPost> = {}): ClientPost[] {
  return Array.from({ length: count }, (_, i) => {
    const itemOverrides: Partial<ClientPost> = { ...overrides }
    if (overrides.slug) {
      itemOverrides.slug = `${overrides.slug}-${i}`
    }
    if (overrides.title) {
      itemOverrides.title = `${overrides.title} ${i}`
    }
    return makePost(itemOverrides)
  })
}

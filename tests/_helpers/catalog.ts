import { afterEach } from 'vitest'

import type { AdminCategoryDto } from '@/shared/contracts/categories'
import type { AdminCommentWire, CommentItemWire } from '@/shared/contracts/comments'
import type { AdminFriendDto } from '@/shared/contracts/friends'
import type { AdminMusicDto } from '@/shared/contracts/music'
import type { AdminPageDto } from '@/shared/contracts/pages'
import type { AdminPostDto } from '@/shared/contracts/posts'
import type { AdminTagDto } from '@/shared/contracts/tags'
import type { AdminUserDto } from '@/shared/contracts/users'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { ClientCategory, ClientPage, ClientPost, ClientTag } from '@/shared/types/catalog'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

// Comment factories derive body keys, content and author fields from one
// shared 1-based sequence so a single test's fixtures stay coherent.
let commentSeq = 0

/** Minimal Lexical comment state — one paragraph with one text node. */
export function makeCommentBody(text: string): CommentEditorState {
  return unsafeCast<CommentEditorState>({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }],
        },
      ],
    },
  })
}

// R12 interregnum: reader-facing fixtures default to legacy PT bodies (the
// wire type is crossed with a deliberate cast) because the comment readers
// still render PT until R13. Write-path tests use makeCommentBody instead.
/** Legacy PT comment body — one normal block with one span. */
export function makePtCommentBody(text: string): CommentEditorState {
  commentSeqBodyKey += 1
  return unsafeCast<CommentEditorState>([
    {
      _type: 'block',
      _key: `b${commentSeqBodyKey}`,
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: `s${commentSeqBodyKey}`, text, marks: [] }],
    },
  ])
}
let commentSeqBodyKey = 0

// Post/page ids are numeric strings — generated ids MUST be numeric (the detail loader Number()s them).
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
    webmentionsEnabled: overrides.webmentionsEnabled ?? true,
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

export function makeAdminUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  const id = overrides.id ?? nextId('user')
  return {
    id,
    name: overrides.name ?? 'User',
    email: overrides.email ?? `${id}@example.com`,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    role: overrides.role ?? 'author',
    isMuted: overrides.isMuted ?? false,
    emailVerified: overrides.emailVerified ?? true,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    commentCount: overrides.commentCount ?? 0,
    pendingCount: overrides.pendingCount ?? 0,
    lastCommentAt: overrides.lastCommentAt ?? null,
    passkeyCount: overrides.passkeyCount ?? 0,
    loginMethod: overrides.loginMethod ?? 'password',
    ...overrides,
  }
}

export function makeAdminMusic(overrides: Partial<AdminMusicDto> = {}): AdminMusicDto {
  return {
    id: overrides.id ?? nextId('music'),
    source: overrides.source ?? 'netease',
    sourceId: overrides.sourceId ?? '1001',
    playerId: overrides.playerId ?? 'abcdef0123456789',
    name: overrides.name ?? '夜的第七章',
    artist: overrides.artist ?? ['周杰伦'],
    album: overrides.album ?? '十一月的萧邦',
    audioStoragePath: overrides.audioStoragePath ?? 'music/audio.mp3',
    audioUrl: overrides.audioUrl ?? 'https://cdn.example.com/audio.mp3',
    coverStoragePath: overrides.coverStoragePath ?? 'music/cover.jpg',
    coverUrl: overrides.coverUrl ?? 'https://cdn.example.com/cover.jpg',
    lyric: overrides.lyric ?? '[00:01.00]夜了呢\n[00:05.00]月光下的苍白',
    uploaderId: overrides.uploaderId ?? 'user-1',
    uploaderName: overrides.uploaderName ?? '雨帆',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeAdminComment(overrides: Partial<AdminCommentWire> = {}): AdminCommentWire {
  commentSeq += 1
  const body: CommentEditorState = makePtCommentBody(`Comment body ${commentSeq}`)
  return {
    id: overrides.id ?? String(commentSeq),
    createAt: overrides.createAt ?? '2024-03-12T08:30:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-03-12T08:30:00.000Z',
    deleteAt: overrides.deleteAt ?? null,
    deleteRequestedAt: overrides.deleteRequestedAt ?? null,
    body,
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? null,
    userId: overrides.userId ?? String(commentSeq),
    isVerified: overrides.isVerified ?? false,
    rid: overrides.rid ?? 0,
    isCollapsed: overrides.isCollapsed ?? false,
    isPending: overrides.isPending ?? false,
    isPinned: overrides.isPinned ?? false,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    rootId: overrides.rootId ?? null,
    name: overrides.name ?? `Author ${commentSeq}`,
    emailVerified: overrides.emailVerified ?? false,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    content: overrides.content ?? `Comment body ${commentSeq}`,
    ua: overrides.ua ?? null,
    ip: overrides.ip ?? null,
    email: overrides.email ?? 'author@example.com',
    pageTitle: overrides.pageTitle ?? null,
    pagePublicId: overrides.pagePublicId ?? null,
    pageCover: overrides.pageCover ?? null,
    pagePermalink: overrides.pagePermalink ?? null,
    ...overrides,
  }
}

export function makeAdminTag(overrides: Partial<AdminTagDto> = {}): AdminTagDto {
  return {
    id: overrides.id ?? nextId('tag'),
    name: overrides.name ?? '默认标签',
    slug: overrides.slug ?? 'default',
    ogImage: overrides.ogImage ?? '/images/open-graph.png',
    postCount: overrides.postCount ?? 0,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

export function makeAdminFriend(overrides: Partial<AdminFriendDto> = {}): AdminFriendDto {
  return {
    id: overrides.id ?? nextId('friend'),
    website: overrides.website ?? '示例博客',
    description: overrides.description ?? '一个示例博客',
    homepage: overrides.homepage ?? 'https://example.com',
    poster: overrides.poster ?? '/images/friends/example.jpg',
    rssUrl: overrides.rssUrl ?? null,
    visible: overrides.visible ?? true,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

export function makeAdminCategory(overrides: Partial<AdminCategoryDto> = {}): AdminCategoryDto {
  return {
    id: overrides.id ?? nextId('cat'),
    name: overrides.name ?? '默认分类',
    slug: overrides.slug ?? 'default',
    cover: overrides.cover ?? '/images/categories/default.jpg',
    og: overrides.og ?? null,
    description: overrides.description ?? '',
    sortOrder: overrides.sortOrder ?? 0,
    postCount: overrides.postCount ?? 0,
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

export function makeAdminPage(overrides: Partial<AdminPageDto> = {}): AdminPageDto {
  const id = overrides.id ?? nextNumericId()
  return {
    id,
    slug: overrides.slug ?? `page-${id}`,
    title: overrides.title ?? `Page ${id}`,
    summary: overrides.summary ?? '',
    cover: overrides.cover ?? '/images/cover.png',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    webmentionsEnabled: overrides.webmentionsEnabled ?? true,
    showToc: overrides.showToc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    showFriends: overrides.showFriends ?? false,
    publishedAt: overrides.publishedAt ?? '2024-01-01T00:00:00.000Z',
    publishedRevisionId: overrides.publishedRevisionId ?? 'rev-1',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    authorId: overrides.authorId ?? null,
    authorName: overrides.authorName ?? 'Author',
    commentCount: overrides.commentCount ?? 0,
    commentPublicId: overrides.commentPublicId ?? `comment-${id}`,
    ...overrides,
  }
}

export function makeComment(overrides: Partial<CommentItemWire> = {}): CommentItemWire {
  commentSeq += 1
  return {
    id: overrides.id ?? String(commentSeq),
    createAt: overrides.createAt ?? '2024-03-12T08:30:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-03-12T08:30:00.000Z',
    deleteAt: overrides.deleteAt ?? null,
    deleteRequestedAt: overrides.deleteRequestedAt ?? null,
    body: overrides.body ?? makePtCommentBody(`Body ${commentSeq}`),
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? '1',
    userId: overrides.userId ?? String(100 + commentSeq),
    isVerified: overrides.isVerified ?? true,
    rid: overrides.rid ?? 0,
    isCollapsed: overrides.isCollapsed ?? false,
    isPending: overrides.isPending ?? false,
    isPinned: overrides.isPinned ?? false,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    rootId: overrides.rootId ?? null,
    name: overrides.name ?? `Author ${commentSeq}`,
    emailVerified: overrides.emailVerified ?? true,
    link: overrides.link ?? null,
    badgeName: overrides.badgeName ?? null,
    badgeColor: overrides.badgeColor ?? null,
    badgeTextColor: overrides.badgeTextColor ?? null,
    children: overrides.children ?? [],
    ...overrides,
  }
}

export function resetCatalogIds(): void {
  counter = 0
  commentSeq = 0
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

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { stubMusicResolver } from '#/_helpers/lexical'
import { hashContent } from '@/server/domains/comments/services/mutate'
import {
  countLegacyPtRows,
  runPtLexicalBackfill,
  type PtLexicalBackfillOptions,
} from '@/server/domains/content/services/pt-lexical-backfill'
import { reindexSearchToCompletion } from '@/server/domains/posts/services/search-reindex'
import { comment as commentTable } from '@/server/infra/db/schema/comment'
import { setting } from '@/server/infra/db/schema/config'
import { content as contentTable, postSearchIndex } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The R15 executor end-to-end (real in-memory DB, real KaTeX/Shiki/jsdom
// projections): dry-run purity, apply semantics, idempotency, failure gating.

const db = getTestDb()

const FLAG_SCOPE = 'system.pt-lexical-backfill'

function opts(overrides: Partial<PtLexicalBackfillOptions> = {}): PtLexicalBackfillOptions {
  return {
    mode: 'dry-run',
    resolveMusicEmbeds: stubMusicResolver({
      p1: {
        id: 'p1',
        name: 'Song',
        artist: 'Artist',
        album: '',
        url: '/storage/music/a.mp3',
        pic: '/storage/music/a.png',
        lyric: '',
      },
    }),
    hashCommentContent: hashContent,
    reindexSearchIndex: () => reindexSearchToCompletion(db),
    ...overrides,
  }
}

const PT_BODY = [
  { _type: 'block', _key: 'b1', style: 'h2', children: [{ _type: 'span', _key: 's1', text: '标题' }] },
  {
    _type: 'block',
    _key: 'b2',
    children: [
      { _type: 'span', _key: 's2', text: '正文 ' },
      { _type: 'span', _key: 's3', text: '粗体', marks: ['strong'] },
    ],
  },
  { _type: 'image', _key: 'i1', src: '/storage/posts/a.png', alt: '封面', storagePath: 'posts/a.png' },
  { _type: 'musicPlayer', _key: 'm1', playerId: 'p1', auto: true },
  { _type: 'mathBlock', _key: 'mb1', tex: 'x^2' },
  { _type: 'code', _key: 'c1', code: 'const a = 1', language: 'ts' },
]

const PT_COMMENT = [
  { _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: '不错的文章' }] },
  { _type: 'mathBlock', _key: 'm1', tex: 'y=1' },
]

async function seedPost(): Promise<{ postId: number; revisionId: number }> {
  const posts = await db
    .insert(postTable)
    .values({
      slug: 'hello',
      title: '你好',
      cover: '',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: postTable.id })
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: posts[0]!.id, revisionNo: 1, status: 'published', body: PT_BODY })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, posts[0]!.id))
  return { postId: posts[0]!.id, revisionId: revisions[0]!.id }
}

async function seedComment(body: unknown = PT_COMMENT): Promise<number> {
  const users = await db
    .insert(commentTable)
    // The seed IS the legacy shape: a PT array in a now-Lexical-typed column.
    .values({ type: 'post', ownerId: 1, userId: 1, body: unsafeCast<CommentEditorState>(body) })
    .returning({ id: commentTable.id })
  return users[0]!.id
}

function contentRow(id: number) {
  return db.select().from(contentTable).where(eq(contentTable.id, id)).all()[0]!
}

function commentRow(id: number) {
  return db.select().from(commentTable).where(eq(commentTable.id, id)).all()[0]!
}

function flagRow() {
  return db.select().from(setting).where(eq(setting.scope, FLAG_SCOPE)).all()[0] ?? null
}

beforeEach(async () => {
  await clearAllTables(db)
})

describe('content/services/pt-lexical-backfill — dry-run purity', () => {
  it('writes nothing: rows, derived columns and the flag stay untouched', async () => {
    const { revisionId } = await seedPost()
    const commentId = await seedComment()
    const before = { content: contentRow(revisionId), comment: commentRow(commentId) }

    const report = await runPtLexicalBackfill(db, opts())

    expect(report.mode).toBe('dry-run')
    expect(report.content).toMatchObject({ totalRows: 1, legacyRows: 1, converted: 1, written: 0, failed: 0 })
    expect(report.comments).toMatchObject({ totalRows: 1, legacyRows: 1, converted: 1, written: 0, failed: 0 })
    expect(report.flagWritten).toBe(false)
    expect(report.searchIndex).toBeNull()
    expect(JSON.stringify(contentRow(revisionId))).toBe(JSON.stringify(before.content))
    expect(JSON.stringify(commentRow(commentId))).toBe(JSON.stringify(before.comment))
    expect(flagRow()).toBeNull()
    expect(countLegacyPtRows(db)).toEqual({ content: 1, comments: 1 })
  })
})

describe('content/services/pt-lexical-backfill — apply', () => {
  it('converts rows, fills projections and derived columns, preserves tokens, writes the flag', async () => {
    const { postId, revisionId } = await seedPost()
    const commentId = await seedComment()
    const before = { content: contentRow(revisionId), comment: commentRow(commentId) }

    const report = await runPtLexicalBackfill(db, opts({ mode: 'apply' }))

    expect(report.content).toMatchObject({ converted: 1, written: 1, failed: 0 })
    expect(report.comments).toMatchObject({ converted: 1, written: 1, failed: 0 })
    expect(report.flagWritten).toBe(true)
    expect(flagRow()).not.toBeNull()

    const row = contentRow(revisionId)
    const state = lexicalEditorStateSchema.parse(row.body)
    expect(state.root.children.map((node) => node.type)).toEqual([
      'extended-heading',
      'paragraph',
      'image',
      'music-player',
      'math',
      'codeblock',
    ])
    // The music resolver snapshot rides the save-pipeline path.
    expect(state.root.children[3]).toMatchObject({
      type: 'music-player',
      playerId: 'p1',
      name: 'Song',
      artist: 'Artist',
    })
    // Projections + derived columns recomputed; artifacts prerendered.
    expect(row.bodyHtml).toContain('inkling-math-card')
    expect(row.bodyHtml).toContain('shiki')
    expect(row.bodyHtml).toContain('aplayer')
    expect(row.bodyText).toContain('标题')
    expect(row.bodyHtmlFeed).not.toBeNull()
    expect(row.imageSources).toEqual(['posts/a.png'])
    expect(row.headings).toEqual([{ depth: 2, slug: '%E6%A0%87%E9%A2%98', text: '标题' }])
    // Not an edit: timestamps and the optimistic-concurrency token survive.
    expect(row.updatedAt).toEqual(before.content.updatedAt)
    expect(row.clientRevisionToken).toBe(before.content.clientRevisionToken)

    const comment = commentRow(commentId)
    expect(comment.body).toMatchObject({ root: {} })
    expect(comment.content).toContain('不错的文章')
    expect(comment.contentHash).toBe(hashContent(comment.content ?? ''))
    expect(comment.updatedAt).toEqual(before.comment.updatedAt)

    // The search index rebuild picked up the converted live post.
    expect(report.searchIndex).toEqual({ processed: 1, failed: 0, total: 1 })
    const indexRows = await db.select().from(postSearchIndex)
    expect(indexRows[0]).toMatchObject({ postId })
    expect(indexRows[0]!.plainText).toContain('标题')
  })

  it('is idempotent — a second apply converts zero rows', async () => {
    await seedPost()
    await seedComment()

    const first = await runPtLexicalBackfill(db, opts({ mode: 'apply' }))
    expect(first.flagWritten).toBe(true)

    const second = await runPtLexicalBackfill(db, opts({ mode: 'apply' }))
    expect(second.content).toMatchObject({ legacyRows: 0, converted: 0, alreadyLexical: 1, written: 0 })
    expect(second.comments).toMatchObject({ legacyRows: 0, converted: 0, alreadyLexical: 1, written: 0 })
    expect(countLegacyPtRows(db)).toEqual({ content: 0, comments: 0 })
  })

  it('withholds the flag and skips the write when a row fails the gate', async () => {
    await seedPost()
    // Dangling mark → unmapped construct → the row fails conversion.
    await seedComment([
      { _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['gone'] }] },
    ])
    const commentId = (await db.select({ id: commentTable.id }).from(commentTable))[0]!.id
    const before = commentRow(commentId)

    const report = await runPtLexicalBackfill(db, opts({ mode: 'apply' }))

    expect(report.comments.failed).toBe(1)
    expect(report.comments.failures[0]!.errors[0]).toContain('dangling-mark:gone')
    expect(report.flagWritten).toBe(false)
    expect(flagRow()).toBeNull()
    expect(JSON.stringify(commentRow(commentId))).toBe(JSON.stringify(before))
    // The healthy content row still converted and was written.
    expect(report.content.written).toBe(1)
  })

  it('persists a meta-less music card when the resolver misses and counts it', async () => {
    await db.insert(contentTable).values({
      type: 'page',
      ownerId: 1,
      revisionNo: 1,
      status: 'published',
      body: [{ _type: 'musicPlayer', _key: 'm1', playerId: 'missing' }],
    })

    const report = await runPtLexicalBackfill(db, opts({ mode: 'apply' }))
    expect(report.music).toMatchObject({ players: 1, resolved: 0, metaLess: 1, metaLessPlayerIds: ['missing'] })
    expect(report.flagWritten).toBe(true)
  })
})

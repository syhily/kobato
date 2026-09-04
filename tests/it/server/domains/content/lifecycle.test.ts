import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContentEntityAdapter, ForceOverwriteEntry } from '@/server/domains/content/lifecycle'
import type { ContentRow } from '@/server/infra/db/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  emptyLexicalBody,
  lexicalBodyWith,
  lexicalImage,
  lexicalMusicPlayer,
  lexicalParagraph,
  stubMusicResolver,
} from '#/_helpers/lexical'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Real repo layer (repo assertions read table state); the entity adapter
// stays fake — the SUT's declared seam. image-sync runs in spy mode to
// force one rejection no real state can produce.
vi.mock('@/server/domains/content/services/image-sync', { spy: true })
vi.mock('@/server/domains/content/revisions', { spy: true })
vi.mock('@/server/infra/pt/lexical-projection', { spy: true })

const { loadDraftPreviewBySlug, saveBody } = await import('@/server/domains/content/lifecycle')
const { syncLibraryImageBlocks } = await import('@/server/domains/content/services/image-sync')
const { findLatestRevision } = await import('@/server/domains/content/revisions')
const { computeBodyProjections } = await import('@/server/infra/pt/lexical-projection')
const { canonicalizeLexicalEditorState } = await import('@/server/domains/pt/services/lexical-canonicalize')

const db = getTestDb()

interface FakeMeta {
  id: number
  publishedRevisionId: number | null
}

interface FakePreview {
  id: string
}

function makeAdapter(meta: FakeMeta | null) {
  const recordForceOverwrite = vi.fn()
  const afterPublish = vi.fn(async () => undefined)
  const adapter: ContentEntityAdapter<FakeMeta, FakePreview> = {
    entityType: 'post',
    findMetaById: () => meta,
    findPublicMetaBySlug: () => meta,
    assertAccess(found: FakeMeta | null): asserts found is FakeMeta {
      if (found === null) {
        throw new DomainError('NOT_FOUND', 'missing')
      }
    },
    canPreviewDraft: () => true,
    getId: (m) => m.id,
    getPublishedRevisionId: (m) => m.publishedRevisionId,
    projectPreview: (m) => ({ id: m.id.toString() }),
    recordForceOverwrite,
    afterPublish,
  }
  return { adapter, recordForceOverwrite, afterPublish }
}

const VALID_BODY = lexicalBodyWith([lexicalParagraph('Hello world')])
const NO_MUSIC = stubMusicResolver()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedPost(): Promise<typeof postMetaTable.$inferSelect> {
  const rows = await db
    .insert(postMetaTable)
    .values({ slug: `post-${Math.random().toString(36).slice(2)}`, title: 'Test', published: false })
    .returning()
  return rows[0]!
}

async function seedRevision(
  ownerId: number,
  overrides: Partial<typeof contentTable.$inferInsert> = {},
): Promise<ContentRow> {
  const rows = await db
    .insert(contentTable)
    .values({
      type: 'post',
      ownerId,
      revisionNo: 1,
      status: 'published',
      // Conflict results project the latest row through the admin revision
      // DTO, which reads a Lexical body since R9a.
      body: emptyLexicalBody(),
      imageSources: [],
      headings: [],
      ...overrides,
    })
    .returning()
  return rows[0]!
}

async function revisionsOf(ownerId: number): Promise<ContentRow[]> {
  return db.select().from(contentTable).where(eq(contentTable.ownerId, ownerId)).orderBy(asc(contentTable.revisionNo))
}

async function allRevisions(): Promise<ContentRow[]> {
  return db.select().from(contentTable)
}

describe('content/lifecycle — saveBody validation', () => {
  it('rejects a malformed body with BAD_REQUEST before touching the repo', async () => {
    const { adapter } = makeAdapter({ id: 1, publishedRevisionId: null })
    await expect(
      saveBody(
        db,
        adapter,
        {
          entityId: 1,
          body: lexicalBodyWith([{ type: 'nope', version: 1, children: [], direction: 'ltr', format: '', indent: 0 }]),
          authorId: null,
          resolveMusicEmbeds: NO_MUSIC,
        },
        'draft',
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await allRevisions()).toHaveLength(0)
  })

  it('propagates the adapter access gate (missing meta → NOT_FOUND)', async () => {
    const { adapter } = makeAdapter(null)
    await expect(
      saveBody(db, adapter, { entityId: 1, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC }, 'draft'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await allRevisions()).toHaveLength(0)
  })
})

describe('content/lifecycle — saveBody degraded sync', () => {
  it('continues with a warning when the image-library sync fails', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    vi.mocked(syncLibraryImageBlocks).mockRejectedValueOnce(new Error('boom'))

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    expect(result.status).toBe('saved')
    expect(result.warning).toBe('图片库同步失败，部分图片可能无法正常显示。')
    // The draft revision was still written despite the degraded sync.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('draft')
    expect(rows[0]!.revisionNo).toBe(1)
  })
})

describe('content/lifecycle — saveBody force overwrite', () => {
  it('records the overwrite against the latest revision when tokens mismatch', async () => {
    const meta = await seedPost()
    // The overwrite context comes from the latest revision of ANY status, not the latest draft.
    const overwritten = await seedRevision(meta.id, {
      revisionNo: 9,
      status: 'published',
      clientRevisionToken: 'server-side-newer',
    })
    const { adapter, recordForceOverwrite } = makeAdapter({ id: meta.id, publishedRevisionId: overwritten.id })

    await saveBody(
      db,
      adapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: 42,
        expectedClientRevisionToken: 'client-thought-this',
        force: true,
        resolveMusicEmbeds: NO_MUSIC,
      },
      'draft',
    )

    expect(recordForceOverwrite).toHaveBeenCalledTimes(1)
    const entry = recordForceOverwrite.mock.calls[0]![0] as ForceOverwriteEntry<FakeMeta>
    expect(entry.mode).toBe('draft')
    expect(entry.authorId).toBe(42)
    expect(entry.meta.id).toBe(meta.id)
    expect(entry.overwritten.id).toBe(overwritten.id)
    expect(entry.overwritten.clientRevisionToken).toBe('server-side-newer')
    expect(entry.expectedClientRevisionToken).toBe('client-thought-this')

    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(2)
    const latest = rows[1]!
    expect(latest.status).toBe('draft')
    expect(latest.revisionNo).toBe(10)
    expect(latest.authorId).toBe(42)
    expect(entry.resultRow.id).toBe(latest.id)
  })

  it('skips the overwrite record when the expected token matches the latest revision', async () => {
    const meta = await seedPost()
    await seedRevision(meta.id, { status: 'published', clientRevisionToken: 'aligned-token' })
    const { adapter, recordForceOverwrite } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    await saveBody(
      db,
      adapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'aligned-token',
        force: true,
        resolveMusicEmbeds: NO_MUSIC,
      },
      'draft',
    )

    expect(recordForceOverwrite).not.toHaveBeenCalled()
    // The force save still wrote a new draft revision.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(2)
    expect(rows[1]!.status).toBe('draft')
  })

  it('propagates a revision-read failure on the force path instead of silently dropping audit context', async () => {
    // Audit P1-25: a read failure on the force path must abort loudly, never be treated as "no prior revision".
    const meta = await seedPost()
    await seedRevision(meta.id, { status: 'published', clientRevisionToken: 'server-token' })
    const { adapter, recordForceOverwrite } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    vi.mocked(findLatestRevision).mockRejectedValueOnce(new Error('transient read failure'))

    await expect(
      saveBody(
        db,
        adapter,
        { entityId: meta.id, body: VALID_BODY, authorId: 42, force: true, resolveMusicEmbeds: NO_MUSIC },
        'draft',
      ),
    ).rejects.toThrow('transient read failure')

    // Aborted before the repo write: only the seeded revision remains.
    expect(await revisionsOf(meta.id)).toHaveLength(1)
    expect(recordForceOverwrite).not.toHaveBeenCalled()
  })
})

describe('content/lifecycle — saveBody result projection', () => {
  it('passes a repo conflict through with the latest revision DTO', async () => {
    const meta = await seedPost()
    const latest = await seedRevision(meta.id, {
      revisionNo: 5,
      status: 'draft',
      clientRevisionToken: '11111111-2222-3333-4444-555555555555',
    })
    const { adapter, recordForceOverwrite, afterPublish } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await saveBody(
      db,
      adapter,
      {
        entityId: meta.id,
        body: VALID_BODY,
        authorId: null,
        expectedClientRevisionToken: 'stale-token',
        resolveMusicEmbeds: NO_MUSIC,
      },
      'draft',
    )

    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.latest.id).toBe(latest.id.toString())
      expect(result.latest.revisionNo).toBe(5)
      expect(result.expectedToken).toBe('11111111-2222-3333-4444-555555555555')
    }
    expect(recordForceOverwrite).not.toHaveBeenCalled()
    expect(afterPublish).not.toHaveBeenCalled()
    // The conflicted save wrote nothing: the seeded draft is untouched.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.clientRevisionToken).toBe('11111111-2222-3333-4444-555555555555')
    expect(rows[0]!.body).toEqual(emptyLexicalBody())
  })
})

describe('content/lifecycle — saveBody publish side effects', () => {
  it('runs afterPublish on a successful publish', async () => {
    const meta = await seedPost()
    const { adapter, afterPublish } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: 5, resolveMusicEmbeds: NO_MUSIC },
      'publish',
    )

    expect(result.status).toBe('saved')
    expect(afterPublish).toHaveBeenCalledTimes(1)
    // Publish landed: revision published, post meta points at it.
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('published')
    const metaRows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, meta.id))
    expect(metaRows[0]!.published).toBe(true)
    expect(metaRows[0]!.publishedRevisionId).toBe(rows[0]!.id)
  })

  it('does not run afterPublish for a draft save', async () => {
    const meta = await seedPost()
    const { adapter, afterPublish } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    expect(afterPublish).not.toHaveBeenCalled()
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('draft')
    const metaRows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, meta.id))
    expect(metaRows[0]!.publishedRevisionId).toBeNull()
  })
})

describe('content/lifecycle — body projections (R9b)', () => {
  it('fills all three projection columns on a draft save', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    expect(result.status).toBe('saved')
    expect(computeBodyProjections).toHaveBeenCalledTimes(1)
    const rows = await revisionsOf(meta.id)
    expect(rows[0]!.bodyHtml).toBe('<p>Hello world</p>')
    expect(rows[0]!.bodyText).toBe('Hello world')
    expect(rows[0]!.bodyHtmlFeed).toBe('<p>Hello world</p>')
  })

  it('fills the projection columns on publish', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'publish',
    )

    expect(result.status).toBe('saved')
    const rows = await revisionsOf(meta.id)
    expect(rows[0]!.status).toBe('published')
    expect(rows[0]!.bodyHtml).toBe('<p>Hello world</p>')
    expect(rows[0]!.bodyHtmlFeed).toBe('<p>Hello world</p>')
  })

  it('writes the feed-degraded variant for math and code blocks', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    // Real KaTeX/Shiki artifacts: canonicalize fills the slots before the
    // projection runs, so the two HTML columns diverge exactly on them.
    const body = lexicalBodyWith([
      { type: 'math', version: 1, tex: 'E=mc^2', mathml: '', svg: '' },
      { type: 'codeblock', version: 1, code: 'const a = 1', language: 'typescript', caption: '', highlightedHtml: '' },
    ])

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    expect(result.status).toBe('saved')
    const rows = await revisionsOf(meta.id)
    // Full fidelity: KaTeX MathML + Shiki embed.
    expect(rows[0]!.bodyHtml).toContain('<math')
    expect(rows[0]!.bodyHtml).toContain('shiki')
    // Feed: escaped TeX + plain pre/code (rssMode parity).
    expect(rows[0]!.bodyHtmlFeed).toContain('<pre><code>E=mc^2</code></pre>')
    expect(rows[0]!.bodyHtmlFeed).toContain('<pre><code class="language-typescript">const a = 1</code></pre>')
    expect(rows[0]!.bodyHtmlFeed).not.toContain('<math')
    expect(rows[0]!.bodyHtmlFeed).not.toContain('shiki')
    expect(rows[0]!.bodyText).toContain('E=mc^2')
  })

  it('recomputes the projections when a draft is overwritten', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    await saveBody(
      db,
      adapter,
      {
        entityId: meta.id,
        body: lexicalBodyWith([lexicalParagraph('Rewritten')]),
        authorId: null,
        resolveMusicEmbeds: NO_MUSIC,
      },
      'draft',
    )

    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.bodyHtml).toBe('<p>Rewritten</p>')
    expect(rows[0]!.bodyText).toBe('Rewritten')
  })

  it('skips the projection computation entirely on the no-op save path', async () => {
    const meta = await seedPost()
    // Seed the published revision with the CANONICAL form of the body the
    // save will carry, so the repo's equivalence short-circuit fires.
    const canonical = await canonicalizeLexicalEditorState(VALID_BODY)
    await seedRevision(meta.id, {
      status: 'published',
      body: canonical as ContentRow['body'],
      bodyHtml: '<p>Hello world</p>',
      bodyText: 'Hello world',
      bodyHtmlFeed: '<p>Hello world</p>',
    })
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    vi.mocked(computeBodyProjections).mockClear()

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    expect(result.status).toBe('saved')
    expect(computeBodyProjections).not.toHaveBeenCalled()
    // No write happened: one revision, columns untouched.
    expect(await revisionsOf(meta.id)).toHaveLength(1)
  })

  it('degrades to NULL projection columns with a warning when the render fails', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    vi.mocked(computeBodyProjections).mockRejectedValueOnce(new Error('render boom'))

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'draft',
    )

    // Best-effort: the save succeeds, the warning surfaces, columns stay NULL.
    expect(result.status).toBe('saved')
    expect(result.warning).toContain('正文投影生成失败')
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.bodyHtml).toBeNull()
    expect(rows[0]!.bodyText).toBeNull()
    expect(rows[0]!.bodyHtmlFeed).toBeNull()
  })
})

describe('content/lifecycle — host card projections (R10)', () => {
  it('renders the three host cards into all projection columns on save', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    const body = lexicalBodyWith([
      lexicalParagraph('before'),
      { type: 'solution', version: 1, content: '<p>答案 42</p>' },
      { type: 'two-column', version: 1, left: '<p>左栏</p>', right: '<p>右栏</p>' },
      lexicalMusicPlayer('p1'),
      lexicalParagraph('after'),
    ])
    // The save-time snapshot fills the meta keys from the resolver, so the
    // projection renders a resolved player without a request-time lookup.
    const music = stubMusicResolver({
      p1: {
        id: 'p1',
        name: 'Song',
        artist: 'Artist',
        album: '',
        url: '/storage/music/song.mp3',
        pic: '/storage/music/cover.png',
        lyric: 'la-la',
      },
    })

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body, authorId: null, resolveMusicEmbeds: music },
      'draft',
    )

    expect(result.status).toBe('saved')
    const rows = await revisionsOf(meta.id)
    // Full fidelity: real card markup (the projection registers the card
    // classes — the R9b substitution path never fires).
    expect(rows[0]!.bodyHtml).toContain('solution-begin')
    expect(rows[0]!.bodyHtml).toContain('<p>答案 42</p>')
    expect(rows[0]!.bodyHtml).toContain('data-pt-two-column=""')
    expect(rows[0]!.bodyHtml).toContain('data-side="right"')
    expect(rows[0]!.bodyHtml).toContain('class="aplayer"')
    expect(rows[0]!.bodyHtml).toContain('data-name="Song"')
    expect(rows[0]!.bodyHtml).toContain('data-url="/storage/music/song.mp3"')
    // Feed: solution unwraps, two-column flattens, music renders the PT
    // rssMode figure.
    expect(rows[0]!.bodyHtmlFeed).toContain('<p>答案 42</p>')
    expect(rows[0]!.bodyHtmlFeed).not.toContain('solution-begin')
    expect(rows[0]!.bodyHtmlFeed).toContain('<p>左栏</p><p>右栏</p>')
    expect(rows[0]!.bodyHtmlFeed).toContain('<figcaption>🎵 Song — Artist</figcaption>')
    // Plain text: card content joins the search corpus.
    expect(rows[0]!.bodyText).toContain('答案 42')
    expect(rows[0]!.bodyText).toContain('左栏\n右栏')
    expect(rows[0]!.bodyText).toContain('Song\nArtist')
  })
})

describe('content/lifecycle — KobatoImage closed loop (R11)', () => {
  it('persists the four host keys, host cards, and block format through save → DB reread', async () => {
    const meta = await seedPost()
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })
    const body = lexicalBodyWith([
      lexicalParagraph('before'),
      { ...lexicalParagraph('Centered line'), format: 'center' },
      // The image-library insert dataset: the four kobato-owned keys the
      // stock inkling ImageNode declaration silently drops. imageId '42'
      // matches no library row, so the save-time relink leaves the node
      // untouched (the relink path is unit-tested in image-sync).
      lexicalImage({
        src: '/storage/posts/cover.png',
        thumbhash: 'THUMB',
        storagePath: 'posts/cover.png',
        imageId: '42',
        layout: 'right',
      }),
      { type: 'solution', version: 1, content: '<p>答案</p>' },
      { type: 'two-column', version: 1, left: '<p>左</p>', right: '<p>右</p>' },
      lexicalMusicPlayer('p1'),
    ])
    const music = stubMusicResolver({
      p1: { id: 'p1', name: 'Song', artist: 'Artist', album: '', url: '/storage/music/song.mp3', pic: '', lyric: '' },
    })

    const result = await saveBody(
      db,
      adapter,
      { entityId: meta.id, body, authorId: null, resolveMusicEmbeds: music },
      'draft',
    )

    expect(result.status).toBe('saved')
    const rows = await revisionsOf(meta.id)
    expect(rows).toHaveLength(1)

    // Reread the stored JSON: canonicalize + the JSON column must not strip
    // the host keys, the card datasets, or the block alignment. The row's
    // body column is `unknown` at the type level; the zod save gate already
    // validated the shape on the way in.
    const savedBody = unsafeCast<{ root: { children: Record<string, unknown>[] } }>(rows[0]!.body)
    const children = savedBody.root.children
    const image = children.find((node) => node.type === 'image')
    expect(image).toMatchObject({
      src: '/storage/posts/cover.png',
      thumbhash: 'THUMB',
      storagePath: 'posts/cover.png',
      imageId: '42',
      layout: 'right',
    })
    expect(children.find((node) => node.type === 'solution')).toMatchObject({ content: '<p>答案</p>' })
    expect(children.find((node) => node.type === 'two-column')).toMatchObject({ left: '<p>左</p>', right: '<p>右</p>' })
    expect(children.find((node) => node.type === 'music-player')).toMatchObject({ playerId: 'p1', name: 'Song' })
    const centered = children.find((node) => node.type === 'paragraph' && node.format === 'center')
    expect(centered).toBeDefined()

    // Derived columns: the image's storagePath feeds imageSources; the
    // projection columns render the host markup (data-thumbhash /
    // data-layout ride the full-fidelity figure).
    expect(rows[0]!.imageSources).toEqual(['posts/cover.png'])
    expect(rows[0]!.bodyHtml).toContain('data-thumbhash="THUMB"')
    expect(rows[0]!.bodyHtml).toContain('data-layout="right"')
    expect(rows[0]!.bodyHtml).toContain('solution-begin')
    expect(rows[0]!.bodyText).toContain('cover')
    expect(rows[0]!.bodyHtmlFeed).not.toBeNull()
  })
})

describe('content/lifecycle — loadDraftPreviewBySlug', () => {
  it('returns null when the slug does not resolve to a meta row', async () => {
    const { adapter } = makeAdapter(null)
    expect(await loadDraftPreviewBySlug(db, adapter, 'nope')).toBeNull()
  })

  it('projects the adapter preview with the draft flag', async () => {
    const meta = await seedPost()
    await seedRevision(meta.id, { status: 'draft' })
    const { adapter } = makeAdapter({ id: meta.id, publishedRevisionId: null })

    const result = await loadDraftPreviewBySlug(db, adapter, 'hello')

    expect(result).not.toBeNull()
    expect(result!.preview.id).toBe(meta.id.toString())
    expect(result!.hasNewerDraft).toBe(true)
  })
})

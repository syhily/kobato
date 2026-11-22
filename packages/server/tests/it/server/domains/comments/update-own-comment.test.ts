import { makeCommentBody } from '@kobato/api/tests/utils/catalog'
import { sqliteOf } from '@kobato/db/database'
import { comment } from '@kobato/db/schema/comment'
import { post } from '@kobato/db/schema/post'
import { user } from '@kobato/db/schema/user'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const emailModule = await import('@kobato/server/domains/comments/services/email')
vi.spyOn(emailModule, 'sendApprovedComment')
vi.spyOn(emailModule, 'sendNewComment')
vi.spyOn(emailModule, 'sendNewReply')

afterAll(() => {
  vi.restoreAllMocks()
})

const { canonicalizeCommentBody } = await import('@kobato/server/domains/comments/services/canonicalize')
const emails = emailModule
const sendNewCommentCalls = () => vi.mocked(emailModule.sendNewComment).mock.calls
const { updateOwnComment } = await import('@kobato/server/domains/comments/services/moderate')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(user)
    .values({
      name: opts.name ?? 'reader',
      email: opts.email ?? `reader-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(slug: string): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(post)
    .values({
      slug,
      title: `Post ${slug}`,
      summary: '',
      published: true,
      publishedRevisionId: 1,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

const OLD_BODY = makeCommentBody('old')

const NEW_BODY = makeCommentBody('edited')

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(comment)
    .values({
      type: 'post',
      ownerId: 1,
      userId: 1,
      content: '<p>old</p>',
      body: OLD_BODY,
      rid: 0,
      rootId: 0,
      isPending: false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

async function readRow(id: number) {
  const rows = await sqliteOf(db).select().from(comment).where(eq(comment.id, id))
  return rows[0]
}

describe('updateOwnComment — decision wiring', () => {
  it('a silent-edit decision rewrites the body in place and skips the admin email', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p1')
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const id = await seedComment({ userId: uid, ownerId: pid, createdAt: tenMinutesAgo, isPending: false })
    const expected = await canonicalizeCommentBody(NEW_BODY)

    const result = await updateOwnComment(db, String(id), NEW_BODY)

    const stored = await readRow(id)
    expect(stored?.content).toBe(expected.content)
    expect(stored?.body).toEqual(expected.body)
    expect(stored?.isPending).toBe(false)
    expect(emails.sendNewComment).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.isPending).toBe(false)
  })

  it('a re-pend decision re-queues the comment and notifies the admin', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p2')
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const id = await seedComment({ userId: uid, ownerId: pid, createdAt: hourAgo, isPending: false })
    const expected = await canonicalizeCommentBody(NEW_BODY)

    const result = await updateOwnComment(db, String(id), NEW_BODY)

    const stored = await readRow(id)
    expect(stored?.content).toBe(expected.content)
    expect(stored?.body).toEqual(expected.body)
    expect(stored?.isPending).toBe(true)
    expect(emails.sendNewComment).toHaveBeenCalledTimes(1)
    const [, commentArg, targetArg] = sendNewCommentCalls()[0]!
    expect(commentArg.isPending).toBe(true)
    expect(targetArg).toEqual({ type: 'post', ownerId: pid })
    expect(result?.isPending).toBe(true)
  })
})

describe('updateOwnComment — persistence edges', () => {
  it('throws CONFLICT when the optimistic lock loses the race', async () => {
    const uid = await seedUser()
    const pid = await seedPost('p3')
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const id = await seedComment({ userId: uid, ownerId: pid, createdAt: tenMinutesAgo })

    const OTHER_BODY = makeCommentBody('edited concurrently')
    const results = await Promise.allSettled([
      updateOwnComment(db, String(id), NEW_BODY),
      updateOwnComment(db, String(id), OTHER_BODY),
    ])

    const rejected = results.filter((r) => r.status === 'rejected')
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error)
    expect(rejected[0]).toMatchObject({
      reason: { descriptor: { messageKey: 'comments.error.modified' } },
    })
    expect(fulfilled).toHaveLength(1)

    const stored = await readRow(id)
    const firstParagraph = stored?.body.root.children[0] as unknown as { children: Array<{ text: string }> } | undefined
    expect(['edited', 'edited concurrently']).toContain(firstParagraph?.children[0]?.text)
    expect(emails.sendNewComment).not.toHaveBeenCalled()
  })

  it('returns null and skips writes when the row vanished mid-edit', async () => {
    const result = await updateOwnComment(db, '9999', NEW_BODY)

    expect(result).toBeNull()
    expect(emails.sendNewComment).not.toHaveBeenCalled()
    const rows = await sqliteOf(db).select({ id: comment.id }).from(comment)
    expect(rows).toHaveLength(0)
  })
})

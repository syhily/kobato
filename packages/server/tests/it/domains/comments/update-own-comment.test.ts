import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexCommentBody } from '#/_helpers/lexical-body'

import { comment } from '@kobato/server/infra/db/schema/comment'
import { post } from '@kobato/server/infra/db/schema/post'
import { user } from '@kobato/server/infra/db/schema/user'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `updateOwnComment` (visitor self-edit of their own comment) delegates
// the grace-window branch to the pure `decideOwnEdit` decider — see
// `tests/unit/server/domains/comments/services/policy.test.ts` for the
// timestamp matrix. This file pins what remains at the persistence seam,
// against the real in-memory engine:
//
//   * the decision drives WHICH optimistic-lock write runs
//     (`updateOwnCommentBody` vs `updateOwnCommentBodyAndPending`) and
//     whether the admin notification fires;
//   * a lost optimistic-lock race (0 rows affected) rejects CONFLICT;
//   * a row that vanished mid-edit returns null without writing.
//
// The canonicalize pipeline is real too (plain paragraph bodies skip the
// Shiki / KaTeX renderers); only the outbound admin email stays mocked.

vi.mock('@kobato/server/domains/comments/services/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
  sendNewReply: vi.fn(async () => undefined),
}))

const { canonicalizeCommentBody } = await import('@kobato/server/domains/comments/services/canonicalize')
const emails = await import('@kobato/server/domains/comments/services/email')
const { updateOwnComment } = await import('@kobato/server/domains/comments/services/moderate')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await db
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
  const rows = await db
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

const OLD_BODY = lexCommentBody('old')

const NEW_BODY = lexCommentBody('edited')

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: 'post',
      ownerId: 1,
      userId: 1,
      content: 'old markdown',
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
  const rows = await db.select().from(comment).where(eq(comment.id, id))
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
    // The moderation state is untouched inside the grace window.
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
    // The notification carries the refetched (now-pending) row + its
    // (type, ownerId) target so the moderation inbox links back to
    // the correct post / page.
    const [, commentArg, targetArg] = vi.mocked(emails.sendNewComment).mock.calls[0]!
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

    // A real lost race: two concurrent edits of the same comment. Both
    // initial SELECTs execute before either write (the second read's
    // execution is queued ahead of the first edit's canonicalize
    // continuation), so both writes carry the same expected
    // `updated_at` — the first one wins and bumps it, the second one
    // matches 0 rows and rejects CONFLICT.
    const OTHER_BODY = lexCommentBody('edited concurrently')
    const results = await Promise.allSettled([
      updateOwnComment(db, String(id), NEW_BODY),
      updateOwnComment(db, String(id), OTHER_BODY),
    ])

    const rejected = results.filter((r) => r.status === 'rejected')
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error)
    expect(((rejected[0] as PromiseRejectedResult).reason as Error).message).toMatch(/评论已被修改/)
    expect(fulfilled).toHaveLength(1)

    // Exactly one write landed; the row carries one of the two edits.
    // (Stored bodies are canonical Lexical since R5a.)
    const stored = await readRow(id)
    const body = stored?.body as unknown as { root: { children: Array<{ children: Array<{ text: string }> }> } }
    expect(['edited', 'edited concurrently']).toContain(body?.root.children[0]?.children[0]?.text)
    expect(emails.sendNewComment).not.toHaveBeenCalled()
  })

  it('returns null and skips writes when the row vanished mid-edit', async () => {
    const result = await updateOwnComment(db, '9999', NEW_BODY)

    expect(result).toBeNull()
    expect(emails.sendNewComment).not.toHaveBeenCalled()
    const rows = await db.select({ id: comment.id }).from(comment)
    expect(rows).toHaveLength(0)
  })
})

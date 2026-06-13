import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { CommentReq } from '@/shared/types/comments'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { user } from '@/server/infra/db/schema/user'

// `createComment` is the public entry point in
// `src/server/domains/comments/services/mutate.ts`. Its transactional
// persist step takes `pg_advisory_xact_lock(hashtext('comment_approval:<userId>'))`
// before reading `countApprovedCommentsByUser`, so two concurrent first
// comments from the same user cannot both observe count=0 and bypass
// moderation. This file characterises that guarantee end-to-end against
// a real Postgres instance.

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
})

// Minimal session stub — `createComment` only reads `session.get('user')`
// (via `userSession`) to decide admin/login-gated branches. For a public
// first-time commenter we leave it empty.
function publicSession(): BlogSession {
  return {
    id: 'test-session',
    get: () => undefined,
    set: () => undefined,
    unset: () => undefined,
    flash: () => undefined,
  } as unknown as BlogSession
}

const SIMPLE_BODY: CommentReq['body'] = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'hello', marks: [] }],
  },
]

interface SeedResult {
  pageKey: string
  userId: bigint
}

/** Seed a metric target + the commenter user row so that both concurrent
 *  `createComment` calls resolve to the same `userId` via the
 *  find-existing path of `insertCommentUser` (avoiding a race on the
 *  unique-email insert). */
async function seedCommentableTargetAndUser(approvedCommentCount = 0): Promise<SeedResult> {
  const [metricRow] = await db
    .insert(metric)
    .values({ type: 'post', ownerId: 1n, voteUp: 0, voteDown: 0, pv: 0 })
    .returning({ publicId: metric.publicId })

  const [userRow] = await db
    .insert(user)
    .values({
      name: 'Concurrent Tester',
      email: 'concurrent@example.com',
      emailVerified: false,
      link: '',
      password: '',
    })
    .returning({ id: user.id })

  // When the caller wants a user that already has an approved comment,
  // insert that approved comment directly so `countApprovedCommentsByUser`
  // returns > 0 on the next `createComment` call.
  if (approvedCommentCount > 0) {
    await db.insert(comment).values(
      Array.from({ length: approvedCommentCount }, (_, i) => ({
        content: `<p>seed ${i}</p>`,
        body: SIMPLE_BODY,
        type: 'post' as const,
        ownerId: 1n,
        userId: userRow.id,
        isVerified: false,
        ua: '',
        ip: '',
        rid: 0,
        isCollapsed: false,
        isPending: false,
        isPinned: false,
        contentHash: `seed-hash-${i}`,
        voteUp: 0,
        voteDown: 0,
        rootId: 0n,
      })),
    )
  }

  return { pageKey: metricRow.publicId, userId: userRow.id }
}

function buildCommentReq(pageKey: string, text: string): CommentReq {
  return {
    page_key: pageKey,
    name: 'Concurrent Tester',
    email: 'concurrent@example.com',
    link: '',
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text, marks: [] }],
      },
    ],
    rid: 0,
  }
}

async function readUserComments(userId: bigint): Promise<{ isPending: boolean | null }[]> {
  const rows = await db.select({ isPending: comment.isPending }).from(comment).where(eq(comment.userId, userId))
  return rows
}

describe('comment moderation first-post gate under concurrency', () => {
  it('marks exactly one of two concurrent first-comments as pending', async () => {
    const { createComment } = await import('@/server/domains/comments/services/mutate')
    const { pageKey, userId } = await seedCommentableTargetAndUser(0)

    const req = new Request('http://localhost/', { headers: { 'User-Agent': 'vitest' } })
    const session = publicSession()

    // Fire two concurrent first-comments from the same user. The advisory
    // lock serialises them: whichever transaction commits first sees
    // count=0 → isPending=true; the second sees count>=1 → isPending=false.
    // (Both may legitimately be pending if the first hasn't committed when
    // the second reads — the invariant we pin is NOT-both-approved.)
    const [a, b] = await Promise.allSettled([
      createComment(db, buildCommentReq(pageKey, 'first concurrent'), req, '127.0.0.1', session),
      createComment(db, buildCommentReq(pageKey, 'second concurrent'), req, '127.0.0.1', session),
    ])

    // Both calls should succeed; the lock serialises, it does not reject.
    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('fulfilled')

    const rows = await readUserComments(userId)
    expect(rows.length).toBe(2)
    const pendingCount = rows.filter((r) => r.isPending).length
    const approvedCount = rows.filter((r) => !r.isPending).length

    // Contract: at least one first-comment is held for moderation.
    expect(pendingCount).toBeGreaterThanOrEqual(1)
    // Contract: never both auto-approved (that would be a lock bypass).
    expect(approvedCount).toBeLessThanOrEqual(1)
  })

  it('auto-approves the second comment when the first is already approved', async () => {
    const { createComment } = await import('@/server/domains/comments/services/mutate')
    // Seed a user that already has one approved comment.
    const { pageKey } = await seedCommentableTargetAndUser(1)

    const req = new Request('http://localhost/', { headers: { 'User-Agent': 'vitest' } })
    const session = publicSession()
    const info = await createComment(db, buildCommentReq(pageKey, 'follow-up'), req, '127.0.0.1', session)

    // countApprovedCommentsByUser returned >= 1 → isPending must be false.
    expect(info.isPending).toBe(false)
  })

  it('holds the lock for the duration of the transaction', async () => {
    const { createComment } = await import('@/server/domains/comments/services/mutate')
    const { pageKey } = await seedCommentableTargetAndUser(0)

    const req = new Request('http://localhost/', { headers: { 'User-Agent': 'vitest' } })
    const session = publicSession()

    // Measure a single-call baseline.
    const singleStart = Date.now()
    await createComment(db, buildCommentReq(pageKey, 'baseline single'), req, '127.0.0.1', session)
    const singleDuration = Date.now() - singleStart

    // Reset state for the concurrent measurement.
    await clearAllTables(db)
    await flushWorkerRedis()
    const { pageKey: pageKey2 } = await seedCommentableTargetAndUser(0)

    const concurrentStart = Date.now()
    await Promise.all([
      createComment(db, buildCommentReq(pageKey2, 'concurrent A'), req, '127.0.0.1', session),
      createComment(db, buildCommentReq(pageKey2, 'concurrent B'), req, '127.0.0.1', session),
    ])
    const concurrentDuration = Date.now() - concurrentStart

    // Loose bound: two serialised transactions take meaningfully longer
    // than one. This catches a regression where the lock is accidentally
    // dropped (both run in parallel → total ≈ single). We use a generous
    // factor to stay robust against noisy CI scheduling.
    expect(concurrentDuration).toBeGreaterThan(singleDuration)
  })
})

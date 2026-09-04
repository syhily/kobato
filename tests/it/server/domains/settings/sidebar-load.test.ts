import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminSession, regularSession } from '#/_helpers/session'
import { loadSidebarData } from '@/server/http/loaders/sidebar'
import { comment } from '@/server/infra/db/schema/comment'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { EMPTY_COMMENT_EDITOR_STATE } from '@/shared/lexical/comment-schema'

// Real latestComments digest incl. the kv cache bucket — cleared with
// every other table in `beforeEach`.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)

  const [commenter] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@example.com', password: 'hashed', role: 'visitor' })
    .returning({ id: user.id })
  const [p] = await db
    .insert(post)
    .values({ slug: 'hello', title: 'Hello', summary: '', published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  await db.insert(comment).values({
    type: 'post',
    ownerId: p.id,
    userId: commenter.id,
    content: 'hello',
    body: EMPTY_COMMENT_EDITOR_STATE,
    rid: 0,
    rootId: 0,
    isPending: false,
  })
})

describe('services/sidebar/load — loadSidebarData', () => {
  it('non-admin session reports admin=false and returns latest comments', async () => {
    const data = await loadSidebarData(db, regularSession())

    expect(data.admin).toBe(false)
    expect(data.recentComments).toHaveLength(1)
    expect(data.recentComments[0]?.author).toBe('Alice')
    expect(data.recentComments[0]?.permalink).toMatch(/^\/posts\/hello\/#user-comment-\d+$/)
  })

  it('admin session reports admin=true and returns latest comments', async () => {
    const data = await loadSidebarData(db, adminSession())

    expect(data.admin).toBe(true)
    expect(data.recentComments).toHaveLength(1)
    expect(data.recentComments[0]?.author).toBe('Alice')
    expect(data.recentComments[0]?.permalink).toMatch(/^\/posts\/hello\/#user-comment-\d+$/)
  })
})

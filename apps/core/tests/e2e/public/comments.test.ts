import { E2eClient, e2eEnv, getAdminCsrfToken, getPublicCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'
import { lexBody, lexCommentBody, lexParagraphNode } from '#/_helpers/lexical-body'

import { describe, expect, it } from 'vitest'

const env = e2eEnv()

const COMMENT_BODY = lexCommentBody('e2e 评论旅程标记')

interface CommentListJson {
  comments: Array<{ id: string; name: string; isPending: boolean | null }>
}

interface PostDetailJson {
  detail: { commentKey: string }
}

// The comment journey across all three actors: a guest's first reply is
// held for moderation (invisible to anonymous readers), the admin queue
// sees and approves it, and only then does the public thread — and the
// post page itself — show it.
describe('public comments flow (HTTP e2e)', () => {
  it('guest reply → moderation hold → admin approve → publicly visible', async () => {
    const admin = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(admin, env)
    expect(res.status).toBe(302)
    const csrfToken = await getAdminCsrfToken(admin)

    const created = await callE2eRpc<{ post: { id: string | number } }>(
      admin,
      '/admin/posts/upsertMeta',
      { title: 'E2E Comments', slug: 'e2e-comments', published: true, publishedAt: new Date().toISOString() },
      csrfToken,
    )
    expect(created.status).toBe(200)
    const postId = String(created.json.post.id)

    // upsertMeta alone never publishes (insert hardcodes published:false
    // and no revision exists) — a guest would get the 404 an anonymous
    // reader sees. Publish a real revision so the live gate opens.
    const published = await callE2eRpc(
      admin,
      '/admin/posts/publishLatest',
      {
        id: postId,
        body: lexBody([lexParagraphNode('e2e 评论宿主正文')]),
      },
      csrfToken,
    )
    expect(published.status).toBe(200)

    try {
      // The page_key the public thread is keyed by comes from the detail
      // payload (the SSR page embeds the same metric public_id; the
      // headless e2e reads the API face directly).
      const guest = new E2eClient(env.baseUrl)
      const detail = await guest.get('/api/content/v1/posts/e2e-comments')
      expect(detail.status).toBe(200)
      const pageKey = ((await detail.json()) as PostDetailJson).detail.commentKey
      // Every /rpc POST — public ones included — passes the csrfGuard, so
      // both anonymous clients need their own session-bound token (the
      // core app shell at `/` mints and embeds it).
      const guestCsrf = await getPublicCsrfToken(guest, '/')

      // Guest reply — a first-time commenter is held pending.
      const reply = await callE2eRpc<{ comment: { id: string; isPending: boolean | null } }>(
        guest,
        '/comments/replyComment',
        { page_key: pageKey, name: 'E2E Guest', email: 'e2e-guest@example.com', body: COMMENT_BODY },
        guestCsrf,
      )
      expect(reply.status).toBe(200)
      expect(reply.json.comment.id).toBeTruthy()
      expect(reply.json.comment.isPending).toBe(true)
      const commentId = reply.json.comment.id

      // Anonymous readers must not see the held comment…
      const anon = new E2eClient(env.baseUrl)
      const anonCsrf = await getPublicCsrfToken(anon, '/')
      const hidden = await callE2eRpc<CommentListJson>(
        anon,
        '/comments/loadComments',
        { page_key: pageKey, offset: 0 },
        anonCsrf,
      )
      expect(hidden.status).toBe(200)
      expect(hidden.json.comments.map((c) => c.id)).not.toContain(commentId)

      // …but the admin moderation queue does, and approves it.
      const queue = await callE2eRpc<{ comments: Array<{ id: string; content: string | null }> }>(
        admin,
        '/admin/comments/loadAll',
        { offset: 0, limit: 20, status: 'pending' },
        csrfToken,
      )
      expect(queue.status).toBe(200)
      expect(queue.json.comments.map((c) => c.id)).toContain(commentId)

      const approved = await callE2eRpc(admin, '/admin/comments/approve', { commentId }, csrfToken)
      expect(approved.status).toBe(200)

      // Now the public thread shows it (the /rpc face — the REST
      // comments/list GET is a documented follow-up: its zod number
      // input rejects string query values, so it is not callable over
      // the query string today).
      const visible = await callE2eRpc<CommentListJson>(
        anon,
        '/comments/loadComments',
        { page_key: pageKey, offset: 0 },
        anonCsrf,
      )
      expect(visible.status).toBe(200)
      expect(visible.json.comments.map((c) => c.id)).toContain(commentId)
    } finally {
      await callE2eRpc(admin, '/admin/posts/delete', { id: String(created.json.post.id) }, csrfToken)
    }
  })
})

import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, getAdminCsrfToken, getPublicCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'

const env = e2eEnv()

const COMMENT_BODY = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'e2e 评论旅程标记', marks: [] }],
    markDefs: [],
  },
]

interface CommentListJson {
  comments: Array<{ id: string; name: string; isPending: boolean | null }>
}

/** The post detail SSR embeds the metric public_id in the reply form's hidden input. */
function scrapePageKey(html: string): string {
  const input = /<input[^>]*name="page_key"[^>]*>/.exec(html)
  const value = input?.[0].match(/value="([^"]+)"/)
  if (!value?.[1]) {
    throw new Error('no page_key hidden input on the post detail page')
  }
  return value[1]
}

// The comment journey across all three actors: guest reply held for
// moderation, admin approves, then the public thread and post show it.
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

    // upsertMeta alone never publishes — publish a real revision so the live gate opens.
    const published = await callE2eRpc(
      admin,
      '/admin/posts/publishLatest',
      {
        id: postId,
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'e2e 评论宿主正文', marks: [] }],
            markDefs: [],
          },
        ],
      },
      csrfToken,
    )
    expect(published.status).toBe(200)

    try {
      // The page_key the public thread is keyed by comes from the page itself.
      const guest = new E2eClient(env.baseUrl)
      const detail = await guest.get('/posts/e2e-comments')
      expect(detail.status).toBe(200)
      const pageKey = scrapePageKey(await detail.text())
      // /rpc POSTs pass the csrfGuard — anonymous clients need their own session-bound token.
      const guestCsrf = await getPublicCsrfToken(guest, '/posts/e2e-comments')

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

      // Now the public thread shows it…
      const visible = await callE2eRpc<CommentListJson>(
        anon,
        '/comments/loadComments',
        { page_key: pageKey, offset: 0 },
        anonCsrf,
      )
      expect(visible.status).toBe(200)
      expect(visible.json.comments.map((c) => c.id)).toContain(commentId)

      // …and so does the streamed SSR of the post page.
      const rerendered = await anon.get('/posts/e2e-comments')
      expect(await rerendered.text()).toContain('e2e 评论旅程标记')
    } finally {
      await callE2eRpc(admin, '/admin/posts/delete', { id: String(created.json.post.id) }, csrfToken)
    }
  })
})

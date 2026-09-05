import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentAndUser } from '@/shared/types/comments'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { sendNewComment } from '@/server/domains/comments/services/email'
import { post } from '@/server/infra/db/schema/post'
import { sendTestMail } from '@/server/infra/email/sender'

// `sendNewComment` against the real engine: the slug/title lookup and the
// saved `content`-projection email body are real; only `fetch` (Zeabur ZSend)
// is stubbed.

const db = getTestDb()

interface MailFixture {
  enabled: boolean
  host: string
  apiKey: string
  sender: string
}

function setMail(mail: Partial<MailFixture>) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, ...mail } },
  })
}

// Shared target post: slug `hi` / title `Hi`, resolved by the real slug lookup.
async function seedTargetPost(): Promise<number> {
  const rows = await db
    .insert(post)
    .values({ slug: 'hi', title: 'Hi', summary: '', published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  return rows[0]!.id
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(async () => {
  await clearAllTables(db)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  // Restore the setup fixture so the next test sees a hydrated snapshot.
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.unstubAllGlobals()
})

describe('email/sender — internalSend (via sendNewComment)', () => {
  // Fixture row used below; the email body comes from the saved `content`
  // degraded-HTML projection column.
  const commentInfo = {
    id: 7,
    body: {
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
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'hello' },
            ],
          },
        ],
      },
    },
    content: '<p>hello</p>',
    isPending: false,
    user: { id: 1, name: 'visitor', email: 'visitor@example.com' },
  } as unknown as CommentAndUser

  it('skips with reason=disabled when the master switch is off', async () => {
    setMail({
      enabled: false,
      host: 'api.zeabur.com',
      apiKey: 'KEY',
      sender: 'noreply@example.com',
    })
    const ownerId = await seedTargetPost()

    const result = await sendNewComment(db, commentInfo, { type: 'post', ownerId })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.reason).toBe('disabled')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips with reason=unconfigured when API key is empty even if enabled', async () => {
    setMail({ enabled: true, host: 'api.zeabur.com', apiKey: '', sender: 'noreply@example.com' })
    const ownerId = await seedTargetPost()

    const result = await sendNewComment(db, commentInfo, { type: 'post', ownerId })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.reason).toBe('unconfigured')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs to the configured Zeabur ZSend endpoint with the bearer token', async () => {
    setMail({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'SECRET',
      sender: 'noreply@example.com',
    })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const ownerId = await seedTargetPost()

    const result = await sendNewComment(db, commentInfo, { type: 'post', ownerId })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.zeabur.com/api/v1/zsend/emails')
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe('Bearer SECRET')
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init?.body as string)
    expect(body.from).toBe('noreply@example.com')
    expect(body.to).toEqual([TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email])
  })

  it('reports upstream rejections through reason=upstream with the status code', async () => {
    setMail({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'SECRET',
      sender: 'noreply@example.com',
    })
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' }))
    const ownerId = await seedTargetPost()

    const result = await sendNewComment(db, commentInfo, { type: 'post', ownerId })

    expect(result.ok).toBe(false)
    if (result.ok === false && result.reason === 'upstream') {
      expect(result.status).toBe(429)
      expect(result.message).toContain('429')
      expect(result.message).not.toContain('quota exceeded')
    } else {
      throw new Error(`expected reason=upstream, got ${JSON.stringify(result)}`)
    }
  })

  it('reports network failures through reason=network', async () => {
    setMail({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'SECRET',
      sender: 'noreply@example.com',
    })
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const ownerId = await seedTargetPost()

    const result = await sendNewComment(db, commentInfo, { type: 'post', ownerId })

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.reason).toBe('network')
      if (result.reason === 'network') {
        expect(result.message).toContain('ECONNREFUSED')
      }
    }
  })
})

describe('comments email — sendNewComment maps onto the admin-notification seam', () => {
  const commentInfo = {
    id: 7,
    body: {
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
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'hello' },
            ],
          },
        ],
      },
    },
    content: '<p>hello</p>',
    isPending: false,
    user: { id: 1, name: 'visitor', email: 'visitor@example.com' },
  } as unknown as CommentAndUser

  function sentBody(): Record<string, unknown> {
    const [, init] = fetchMock.mock.calls[0]
    return JSON.parse(init?.body as string)
  }

  beforeEach(() => {
    setMail({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'SECRET',
      sender: 'noreply@example.com',
    })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
  })

  it('sends the comment card to the author under the shared subject convention', async () => {
    const ownerId = await seedTargetPost()

    await sendNewComment(db, commentInfo, { type: 'post', ownerId })

    const body = sentBody()
    expect(body.to).toEqual([TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email])
    expect(body.subject).toBe(`您的网站【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】有了新评论`)
    const html = body.html as string
    expect(html).toContain('新留言')
    expect(html).toContain('留言文章：')
    // Resolved from the seeded post row: slug `hi`, title `Hi`.
    expect(html).toContain('>Hi</a>')
    expect(html).toContain('href="https://example.com/posts/hi/"')
    // The saved `content` projection lands inline, sanitized.
    expect(html).toContain('<p>hello</p>')
    expect(html).toContain('href="https://example.com/posts/hi/#user-comment-7"')
    // Not pending → no approval note.
    expect(html).not.toContain('该留言需要审核')
  })

  it('sanitizes the saved projection before injecting it into the email', async () => {
    const ownerId = await seedTargetPost()

    await sendNewComment(
      db,
      { ...commentInfo, content: '<p>hi</p><script>alert(1)</script><a href="javascript:alert(2)">x</a>' },
      { type: 'post', ownerId },
    )

    const html = sentBody().html as string
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<p>hi</p>')
  })

  it('degrades legacy pre-Lexical array bodies to escaped plain text', async () => {
    const ownerId = await seedTargetPost()
    // A pre-R12 row: PT array body, markdown (not HTML) content snapshot.
    const legacy = {
      ...commentInfo,
      body: [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'legacy <b>raw</b> text', marks: [] }],
        },
      ],
      content: 'legacy <b>raw</b> text',
    } as unknown as CommentAndUser

    await sendNewComment(db, legacy, { type: 'post', ownerId })

    const html = sentBody().html as string
    // Plain text, escaped — the markdown snapshot is NOT injected as HTML.
    expect(html).toContain('legacy &lt;b&gt;raw&lt;/b&gt; text')
    expect(html).not.toContain('<b>raw</b>')
  })

  it('adds the approval note for pending comments', async () => {
    const ownerId = await seedTargetPost()

    await sendNewComment(db, { ...commentInfo, isPending: true }, { type: 'post', ownerId })

    expect(sentBody().html).toContain('该留言需要审核')
  })
})

describe('email/sender — sendTestMail', () => {
  it('bypasses the enabled toggle so editors can verify before going live', async () => {
    setMail({
      enabled: false,
      host: 'api.zeabur.com',
      apiKey: 'KEY',
      sender: 'noreply@example.com',
    })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await sendTestMail('me@example.com')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init?.body as string)
    expect(body.to).toEqual(['me@example.com'])
    expect(body.subject).toContain(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title)
  })

  it('still refuses to send when the configuration is incomplete', async () => {
    setMail({ enabled: true, host: 'api.zeabur.com', apiKey: '', sender: 'noreply@example.com' })

    const result = await sendTestMail('me@example.com')

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.reason).toBe('unconfigured')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces upstream errors with the original status', async () => {
    setMail({
      enabled: true,
      host: 'api.zeabur.com',
      apiKey: 'SECRET',
      sender: 'noreply@example.com',
    })
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403, statusText: 'Forbidden' }))

    const result = await sendTestMail('me@example.com')

    expect(result.ok).toBe(false)
    if (result.ok === false && result.reason === 'upstream') {
      expect(result.status).toBe(403)
    } else {
      throw new Error('expected reason=upstream')
    }
  })
})

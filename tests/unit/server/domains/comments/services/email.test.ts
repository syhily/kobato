import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentAndUser } from '@/shared/types/comments'

// `commentBodyToHtml` pulls in the whole PT prerender pipeline (Shiki,
// KaTeX, …) — stub it so the test can focus on the sender's transport /
// config branches and the admin-notification mapping.
vi.mock('@/server/domains/pt/services/comment-to-html', () => ({
  commentBodyToHtml: vi.fn(() => '<p>stub</p>'),
}))

// `sender.ts` resolves the entity's current slug + title at send time.
// Stub the lookup so the test doesn't need a real DB; the e2e tests pin
// the full resolver path.
vi.mock('@/server/domains/content/entities/slug-title', () => ({
  findEntitySlugTitle: vi.fn(async () => ({ slug: 'hi', title: 'Hi' })),
}))

const db = {} as NodePgDatabase

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { sendNewComment } = await import('@/server/domains/comments/services/email')
const { sendTestMail } = await import('@/server/infra/email/sender')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

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

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  // Restore the global fixture installed by `tests/setup.ts` so the
  // next test in this file (and other files reusing the worker) sees a
  // hydrated snapshot.
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.unstubAllGlobals()
})

describe('email/sender — internalSend (via sendNewComment)', () => {
  // Fixture row used by every comment-fired test below.
  const commentInfo = {
    id: 7n,
    content: 'hello',
    isPending: false,
    user: { id: 1n, name: 'visitor', email: 'visitor@example.com' },
  } as unknown as CommentAndUser
  const target = { type: 'post' as const, ownerId: 1n }

  it('skips with reason=disabled when the master switch is off', async () => {
    setMail({
      enabled: false,
      host: 'api.zeabur.com',
      apiKey: 'KEY',
      sender: 'noreply@example.com',
    })

    const result = await sendNewComment(db, commentInfo, target)

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.reason).toBe('disabled')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips with reason=unconfigured when API key is empty even if enabled', async () => {
    setMail({ enabled: true, host: 'api.zeabur.com', apiKey: '', sender: 'noreply@example.com' })

    const result = await sendNewComment(db, commentInfo, target)

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

    const result = await sendNewComment(db, commentInfo, target)

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

    const result = await sendNewComment(db, commentInfo, target)

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

    const result = await sendNewComment(db, commentInfo, target)

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
    id: 7n,
    content: 'hello',
    isPending: false,
    user: { id: 1n, name: 'visitor', email: 'visitor@example.com' },
  } as unknown as CommentAndUser
  const target = { type: 'post' as const, ownerId: 1n }

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
    await sendNewComment(db, commentInfo, target)

    const body = sentBody()
    expect(body.to).toEqual([TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email])
    expect(body.subject).toBe(`您的网站【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】有了新评论`)
    const html = body.html as string
    expect(html).toContain('新留言')
    expect(html).toContain('留言文章：')
    // Resolved entity fixture: slug `hi`, title `Hi`.
    expect(html).toContain('>Hi</a>')
    expect(html).toContain('href="https://example.com/posts/hi/"')
    // The `commentBodyToHtml` stub renders raw inside the card.
    expect(html).toContain('<p>stub</p>')
    expect(html).toContain('href="https://example.com/posts/hi/#user-comment-7"')
    // Not pending → no approval note.
    expect(html).not.toContain('该留言需要审核')
  })

  it('adds the approval note for pending comments', async () => {
    await sendNewComment(db, { ...commentInfo, isPending: true }, target)

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

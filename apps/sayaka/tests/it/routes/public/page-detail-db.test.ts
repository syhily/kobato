import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { loader } from '@sayaka/routes/page/detail'
import { createStubKobato, loaderData, makeSayakaLoaderArgs } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

function args(stub: ReturnType<typeof createStubKobato>, request: Request): Parameters<typeof loader>[0] {
  return unsafeCast<Parameters<typeof loader>[0]>(
    makeSayakaLoaderArgs({ stub, request, params: { slug: 'about' } }).args,
  )
}

function makePayload(bodyHtml: string) {
  return unsafeCast<Record<string, unknown>>({
    page: {
      title: 'About',
      slug: 'about',
      permalink: '/about',
      headings: [{ depth: 2, text: 'intro', id: 'intro' }],
      lang: 'zh-CN',
    },
    bodyHtml,
    friends: [],
    showFriends: false,
    critical: { commentKey: 'page:1', likes: 0, admin: false, currentUser: null, recentComments: [] },
    draftMarker: null,
  })
}

function stubWith(payload: Record<string, unknown>) {
  return createStubKobato({
    'public.content.pages.bySlug': () => ({ kind: 'ok', etag: 'W/"page"', payload }),
    'public.content.comments.byKey': () => ({ comments: [], totalCount: 0 }),
    'public.webmentions.list': () => ({ webmentions: [] }),
  })
}

describe('routes/page.detail loader (DB-backed page)', () => {
  it('relays the saved body_html projection untouched', async () => {
    const stub = stubWith(makePayload('<h2 id="intro">intro</h2><p>projected</p>'))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, new Request('http://localhost/about'))))
    expect(result.bodyHtml).toBe('<h2 id="intro">intro</h2><p>projected</p>')
  })

  it('preserves headings + permalink so SEO + URL-stable consumers keep working', async () => {
    const stub = stubWith(makePayload('<p>x</p>'))

    const result = loaderData<Record<string, unknown>>(await loader(args(stub, new Request('http://localhost/about'))))
    const page = unsafeCast<{ permalink: string; headings: unknown[] }>(result.page)
    expect(page.permalink).toBe('/about')
    expect(page.headings).toEqual([{ depth: 2, text: 'intro', id: 'intro' }])
  })
})

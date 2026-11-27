import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { loader as rootLoader } from '@sayaka/root'
import { createStubKobato, makeSayakaLoaderArgs, STUB_BOOTSTRAP, stubCallsFor } from '@sayaka/tests/utils/stub-kobato'
import { describe, expect, it } from 'vitest'

type RootLoader = typeof rootLoader

function requestWithDest(path: string, dest: string | null): Request {
  const request = new Request(`http://localhost${path}`)
  if (dest !== null) {
    request.headers.set('sec-fetch-dest', dest)
  }
  return request
}

async function invoke(request: Request, noAdmin: boolean) {
  const stub = createStubKobato({
    'public.content.bootstrap': () => (noAdmin ? { ...STUB_BOOTSTRAP, installState: 'noAdmin' } : STUB_BOOTSTRAP),
  })
  const { args } = makeSayakaLoaderArgs({ stub, request, params: {} })
  const outcome = await rootLoader(unsafeCast<Parameters<RootLoader>[0]>(args)).then(
    (data: unknown) => ({ thrown: null, data }),
    (error: unknown) => ({ thrown: error, data: null }),
  )
  return { stub, outcome }
}

describe('root loader install gate', () => {
  it('keeps answering the 303 to /admin/setup for a plain request without Sec-Fetch-Dest', async () => {
    const { outcome } = await invoke(requestWithDest('/', null), true)
    const thrown = unsafeCast<Response>(outcome.thrown)
    expect(thrown).toBeInstanceOf(Response)
    expect(thrown.status).toBe(303)
    expect(thrown.headers.get('Location')).toBe('/admin/setup')
  })

  it('keeps answering the 303 for a document navigation', async () => {
    const { outcome } = await invoke(requestWithDest('/', 'document'), true)
    const thrown = unsafeCast<Response>(outcome.thrown)
    expect(thrown.status).toBe(303)
    expect(thrown.headers.get('Location')).toBe('/admin/setup')
  })

  it('lets a sub-resource request through to its resource route while no admin exists', async () => {
    const { stub, outcome } = await invoke(requestWithDest('/logo-large.svg', 'image'), true)
    expect(outcome.thrown).toBeNull()
    expect(outcome.data).toMatchObject({ installState: 'noAdmin' })
    expect(stubCallsFor(stub, 'public.content.bootstrap')).toHaveLength(1)
  })

  it('renders the home document for a navigation once an admin exists', async () => {
    const { outcome } = await invoke(requestWithDest('/', 'document'), false)
    expect(outcome.thrown).toBeNull()
    expect(outcome.data).toMatchObject({ installState: 'installed' })
  })
})

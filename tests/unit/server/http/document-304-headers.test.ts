import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { detailHeaders, listingHeaders } from '@/server/http/loaders/route-exports'
import { notModifiedResponse } from '@/server/infra/http/etag'
import { documentHeaders } from '@/server/infra/http/headers'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'

// The REAL React Router document-header reducer (v8.5.1). It is not part of
// the public export surface, so the test loads the installed runtime module
// by file path — the same code `createRequestHandler` runs for every document.
const requireFromProject = createRequire(`${process.cwd()}/package.json`)
const { getDocumentHeaders } = requireFromProject(
  './node_modules/react-router/dist/development/lib/server-runtime/headers.js',
) as {
  getDocumentHeaders: (
    context: unknown,
    build: { routes: Record<string, { module: Record<string, unknown> }> },
  ) => Headers
}

const ROOT_ID = 'root'
const LAYOUT_ID = 'routes/public/layout'
const DETAIL_ID = 'routes/public/post/detail'
const LISTING_ID = 'routes/public/home'

const build = {
  routes: {
    [ROOT_ID]: { module: { headers: documentHeaders } },
    // `routes/public/layout.tsx` exports the same pass-through: it owns the
    // public ErrorBoundary, so a loader-thrown 304 bubbles to IT, not to root.
    [LAYOUT_ID]: { module: { headers: documentHeaders } },
    [DETAIL_ID]: { module: { headers: detailHeaders } },
    [LISTING_ID]: { module: { headers: listingHeaders } },
  },
}

const matches = [{ route: { id: ROOT_ID } }, { route: { id: LAYOUT_ID } }, { route: { id: DETAIL_ID } }]
const listingMatches = [{ route: { id: ROOT_ID } }, { route: { id: LAYOUT_ID } }, { route: { id: LISTING_ID } }]

function documentContext({
  errors,
  loaderHeaders,
  loaderData,
  routeMatches = matches,
}: {
  errors: Record<string, unknown> | null
  loaderHeaders: Record<string, Headers>
  loaderData: Record<string, unknown>
  routeMatches?: typeof matches
}) {
  return { matches: routeMatches, actionHeaders: {}, actionData: null, errors, loaderHeaders, loaderData }
}

describe('document headers — route wiring', () => {
  it.each(['src/root.tsx', 'src/routes/public/layout.tsx'])('%s exports the pass-through headers()', (file) => {
    // The boundary that receives `errorHeaders` is the one that must export it:
    // root for a root-level failure, the public layout for every public route.
    expect(readFileSync(resolve(process.cwd(), file), 'utf8')).toContain('export const headers = documentHeaders')
  })
})

describe('document headers — 200 detail response', () => {
  it('keeps the loader ETag while the route profile supplies Cache-Control', () => {
    const loaderHeaders = new Headers({ ETag: 'W/"detail-200"' })
    const headers = getDocumentHeaders(
      documentContext({
        errors: null,
        loaderHeaders: { [DETAIL_ID]: loaderHeaders },
        loaderData: { [ROOT_ID]: {}, [LAYOUT_ID]: null, [DETAIL_ID]: { post: 'x' } },
      }),
      build,
    )

    expect(headers.get('ETag')).toBe('W/"detail-200"')
    expect(headers.get('Cache-Control')).toBe('private, no-cache')
    expect(headers.get('Vary')).toBe('Cookie')
  })
})

describe('document headers — 200 listing response', () => {
  it('keeps the loader ETag and supplies private, no-cache', () => {
    const headers = getDocumentHeaders(
      documentContext({
        errors: null,
        loaderHeaders: { [LISTING_ID]: new Headers({ ETag: 'W/"listing-200"' }) },
        loaderData: { [ROOT_ID]: {}, [LAYOUT_ID]: null, [LISTING_ID]: { listing: 'x' } },
        routeMatches: listingMatches,
      }),
      build,
    )

    expect(headers.get('ETag')).toBe('W/"listing-200"')
    expect(headers.get('Cache-Control')).toBe('private, no-cache')
    expect(headers.get('Vary')).toBe('Cookie')
  })
})

describe('document headers — thrown listing 304', () => {
  it('preserves the listing ETag, Content-Language and Cache-Control', () => {
    const thrown = notModifiedResponse(
      'W/"listing-304"',
      {
        locale: 'en-US',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'yyyy-MM-dd',
        revision: 'boot-test:process-identity',
        revisions: representationRevisionsFor(null),
      },
      'listing',
    )
    const headers = getDocumentHeaders(
      documentContext({
        errors: { [LAYOUT_ID]: { status: 304 } },
        loaderHeaders: { [LISTING_ID]: thrown.headers },
        loaderData: {},
        routeMatches: listingMatches,
      }),
      build,
    )

    expect(headers.get('ETag')).toBe('W/"listing-304"')
    expect(headers.get('Content-Language')).toBe('en-US')
    expect(headers.get('Cache-Control')).toBe('private, no-cache')
    expect(headers.get('Vary')).toBe('Cookie')
  })
})

describe('document headers — thrown 304 document response', () => {
  // A loader-thrown 304 bubbles to the public layout's ErrorBoundary: RR slices `matches`
  // to [root, layout] and only hands the thrown headers to the LAST match's headers() as
  // `errorHeaders`, so the detail route's own headers() never runs.
  const thrown = notModifiedResponse('W/"detail-304"', {
    locale: 'zh-TW',
    timeZone: 'Asia/Taipei',
    timeFormat: 'yyyy-LL-dd',
    revision: 'boot-test:0000000005',
    revisions: representationRevisionsFor(null),
  })
  const context = documentContext({
    errors: { [LAYOUT_ID]: { status: 304 } },
    loaderHeaders: { [DETAIL_ID]: thrown.headers },
    loaderData: {},
  })

  it('the thrown Response itself carries the current representation headers', () => {
    expect(thrown.status).toBe(304)
    expect(thrown.headers.get('ETag')).toBe('W/"detail-304"')
    expect(thrown.headers.get('Content-Language')).toBe('zh-TW')
    expect(thrown.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(thrown.headers.get('Vary')).toBe('Cookie')
  })

  it('getDocumentHeaders preserves ETag, Content-Language and Cache-Control', () => {
    const headers = getDocumentHeaders(context, build)

    expect(headers.get('ETag')).toBe('W/"detail-304"')
    expect(headers.get('Content-Language')).toBe(thrown.headers.get('Content-Language'))
    expect(headers.get('Cache-Control')).toBe('private, no-cache')
    expect(headers.get('Vary')).toBe('Cookie')
  })
})

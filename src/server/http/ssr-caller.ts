import type { LoaderFunctionArgs } from 'react-router'

import { createRouterClient, ORPCError, type RouterClient } from '@orpc/server'
import { redirect } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { ApiRouter } from '@/server/http/api-router'
import type { HandlerContext } from '@/server/http/orpc-base'
import type { ContentNotModifiedSignal, ContentRedirectSignal, ContentSignal } from '@/shared/contracts/content'
import type { PublicWebmentionWire } from '@/shared/contracts/webmentions'
import type { AppLocalization } from '@/shared/i18n/app-localization'
import type { DetailPageComments } from '@/shared/types/comments'

import { apiRouter } from '@/server/http/api-router'
import { createOrpcTraceInterceptor } from '@/server/http/orpc-trace'
import { getRequestContext } from '@/server/http/request-context'
import { notModifiedResponse } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'

// In-process oRPC caller for SSR loaders — every public/admin data read goes
// through this single transport seam. Zero HTTP, zero serialization: `Date`s
// and un-awaited `Promise`s pass through untouched (streaming stays intact).
export type SsrCaller = RouterClient<ApiRouter>

// One interceptor instance for the process: `createRouterClient` invokes it
// with the matched procedure `path`, so an in-process SSR call is named and
// parented exactly like a network call — with `in_process` marking the
// transport so it is never mistaken for an HTTP hop.
const ssrTraceInterceptor = createOrpcTraceInterceptor('in_process')

type SsrCallerArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export type SsrCallerResult = {
  caller: SsrCaller
  cspNonce: string
  /** The request's minted analytics event id — public loaders publish it as
   *  loader data `eid` so the client beacon can join the server-side row. */
  analyticsEventId: string
  /**
   * Canonical session identity — route-level `requireRole` gates read it,
   * so route modules never import `getRequestContext` themselves.
   */
  viewer: SessionUser | null
  /** The canonical session — `isCurrent` projections read `session.id`. */
  session: BlogSession
  /**
   * The request's localization projection — `unwrapDetail` stamps a thrown 304
   * from THIS object (never the global snapshot), so the tag, the language
   * header and the served body always describe one representation.
   */
  localization: AppLocalization
}

export function createSsrCaller(args: SsrCallerArgs): SsrCallerResult {
  const rc = getRequestContext(args)
  // Same projection as the Hono `/rpc/*` bridge, fresh `responseHeaders` bag (never merged).
  const context: HandlerContext = {
    request: args.request,
    requestFacts: rc.requestFacts,
    session: rc.session,
    viewer: rc.viewer,
    clientAddress: rc.clientAddress,
    responseHeaders: new Headers(),
    db: rc.db,
    settings: rc.settings,
    localization: rc.localization,
  }
  // Nonce derives once here so route modules never call `getRequestContext` themselves.
  return {
    caller: createRouterClient(apiRouter, { context, interceptors: [ssrTraceInterceptor] }),
    cspNonce: rc.cspNonce,
    analyticsEventId: rc.requestFacts.analyticsEventId,
    viewer: rc.viewer,
    session: rc.session,
    localization: rc.localization,
  }
}

// `content.*` NOT_FOUNDs → React Router 404; every other error propagates.
export function isOrpcNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'NOT_FOUND'
}

// 30x/304 signals arrive as DATA — the unwrap helpers translate them back
// into the thrown Responses (301 canonical / 302 pagination / 304 ETag).

type ListingResult<T> = ContentRedirectSignal | ContentNotModifiedSignal | { kind: 'ok'; etag: string; listing: T }

type ListingPayloadResult<T> = ContentNotModifiedSignal | { kind: 'ok'; etag: string; payload: T }

/** Listing loaders: NOT_FOUND → 404, `redirect` → the thrown 301/302,
 *  `not-modified` → a 304 rebuilt from the REQUEST's localization. */
export async function unwrapListing<T>(
  promise: Promise<ListingResult<T>>,
  localization: AppLocalization,
): Promise<{ etag: string; listing: T }> {
  let result
  try {
    result = await promise
  } catch (error) {
    if (isOrpcNotFound(error)) {
      notFound()
    }
    throw error
  }
  if (result.kind === 'not-modified') {
    throw notModifiedResponse(result.etag, localization, 'listing')
  }
  if (result.kind === 'redirect') {
    throw redirect(result.to, { status: result.status })
  }
  return { etag: result.etag, listing: result.listing }
}

/** Flat listing payloads (archives, categories): same 304 contract as `unwrapListing`. */
export async function unwrapListingPayload<T>(
  promise: Promise<ListingPayloadResult<T>>,
  localization: AppLocalization,
): Promise<{ etag: string; payload: T }> {
  let result
  try {
    result = await promise
  } catch (error) {
    if (isOrpcNotFound(error)) {
      notFound()
    }
    throw error
  }
  if (result.kind === 'not-modified') {
    throw notModifiedResponse(result.etag, localization, 'listing')
  }
  return { etag: result.etag, payload: result.payload }
}

/** Detail loaders: NOT_FOUND → 404, `not-modified` → 304, `redirect` → 301.
 *  The page variant's `etag` is nullable (draft previews carry none). The 304 is
 *  rebuilt from the REQUEST's localization so its headers match the body that
 *  produced the tag. */
export async function unwrapDetail<T, ETag extends string | null>(
  promise: Promise<ContentSignal | { kind: 'ok'; etag: ETag; payload: T }>,
  localization: AppLocalization,
): Promise<{ etag: ETag; payload: T }> {
  let result
  try {
    result = await promise
  } catch (error) {
    if (isOrpcNotFound(error)) {
      notFound()
    }
    throw error
  }
  if (result.kind === 'not-modified') {
    throw notModifiedResponse(result.etag, localization)
  }
  if (result.kind === 'redirect') {
    redirectPermanent(result.to)
  }
  return { etag: result.etag, payload: result.payload }
}

// Comments + webmentions fan-out off the detail comment key — shared by the
// post and page loaders; both promises stay un-awaited so `<Await>` streams them.
export function streamDetailExtras(
  caller: SsrCaller,
  commentKey: string,
): { comments: Promise<DetailPageComments>; webmentions: Promise<PublicWebmentionWire[]> } {
  return {
    comments: caller.content.comments.byKey({ pageKey: commentKey }),
    webmentions: caller.webmention.list({ page_key: commentKey }).then((r) => r.webmentions),
  }
}

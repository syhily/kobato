import type { LoaderFunctionArgs } from 'react-router'

import { createRouterClient, ORPCError, type RouterClient } from '@orpc/server'
import { redirect } from 'react-router'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { ApiRouter } from '@/server/http/api-router'
import type { HandlerContext } from '@/server/http/orpc-base'
import type { ContentRedirectSignal, ContentSignal } from '@/shared/contracts/content'
import type { PublicWebmentionWire } from '@/shared/contracts/webmentions'
import type { DetailPageComments } from '@/shared/types/comments'

import { apiRouter } from '@/server/http/api-router'
import { getRequestContext } from '@/server/http/request-context'
import { notModifiedResponse } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'

// In-process oRPC caller for SSR loaders — every public/admin data read goes
// through this single transport seam. Zero HTTP, zero serialization: `Date`s
// and un-awaited `Promise`s pass through untouched (streaming stays intact).
export type SsrCaller = RouterClient<ApiRouter>

type SsrCallerArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export type SsrCallerResult = {
  caller: SsrCaller
  cspNonce: string
  /**
   * Canonical session identity — route-level `requireRole` gates read it,
   * so route modules never import `getRequestContext` themselves.
   */
  viewer: SessionUser | null
  /** The canonical session — `isCurrent` projections read `session.id`. */
  session: BlogSession
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
  }
  // Nonce derives once here so route modules never call `getRequestContext` themselves.
  return {
    caller: createRouterClient(apiRouter, { context }),
    cspNonce: rc.cspNonce,
    viewer: rc.viewer,
    session: rc.session,
  }
}

// `content.*` NOT_FOUNDs → React Router 404; every other error propagates.
export function isOrpcNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'NOT_FOUND'
}

// 30x/304 signals arrive as DATA — the unwrap helpers translate them back
// into the thrown Responses (301 canonical / 302 pagination / 304 ETag).

type ListingResult<T> = ContentRedirectSignal | { kind: 'ok'; listing: T }

/** Listing loaders: NOT_FOUND → 404, `redirect` → the thrown 301/302. */
export async function unwrapListing<T>(promise: Promise<ListingResult<T>>): Promise<T> {
  let result
  try {
    result = await promise
  } catch (error) {
    if (isOrpcNotFound(error)) {
      notFound()
    }
    throw error
  }
  if (result.kind === 'redirect') {
    throw redirect(result.to, { status: result.status })
  }
  return result.listing
}

/** Detail loaders: NOT_FOUND → 404, `not-modified` → 304, `redirect` → 301.
 *  The page variant's `etag` is nullable (draft previews carry none). */
export async function unwrapDetail<T, ETag extends string | null>(
  promise: Promise<ContentSignal | { kind: 'ok'; etag: ETag; payload: T }>,
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
    throw notModifiedResponse(result.etag)
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

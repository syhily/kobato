import type { LoaderFunctionArgs } from 'react-router'

import { createRouterClient, ORPCError, type RouterClient } from '@orpc/server'
import { redirect } from 'react-router'

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

// The in-process oRPC caller for SSR route loaders. Public routes (and
// the root loader) never touch `@/server/domains/*` directly — every
// data read goes through the `content.*` procedures (plus the existing
// `webmention.list`) via this client, so the public render path has a
// single transport seam shared with the headless API.
//
// `createRouterClient` invokes the procedures in-process: zero HTTP,
// zero serialization — `Date`s and un-awaited `Promise`s (the streaming
// comments/webmentions fired by the detail loaders) pass through
// untouched, which is what keeps the `<Await>` streaming behaviour
// bit-identical to direct domain calls.
export type SsrCaller = RouterClient<ApiRouter>

type SsrCallerArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export function createSsrCaller(args: SsrCallerArgs): { caller: SsrCaller; cspNonce: string } {
  const rc = getRequestContext(args)
  // Same projection the Hono `/rpc/*` bridge performs (app.ts), with a
  // fresh `responseHeaders` bag — the SSR caller never merges it onto a
  // Response because the content procedures don't write headers.
  const context: HandlerContext = {
    request: args.request,
    requestFacts: rc.requestFacts,
    session: rc.session,
    viewer: rc.viewer,
    clientAddress: rc.clientAddress,
    responseHeaders: new Headers(),
    db: rc.db,
  }
  // The CSP nonce is the one sanctioned extra peek into the canonical
  // request context (root loader keeps it as infrastructure data) — it
  // derives once here so route modules never call `getRequestContext`
  // themselves.
  return { caller: createRouterClient(apiRouter, { context }), cspNonce: rc.cspNonce }
}

// Route loaders translate `content.*` NOT_FOUNDs back into the React
// Router 404 (`notFound()`); every other error propagates.
export function isOrpcNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'NOT_FOUND'
}

// 30x/304 signals arrive as DATA (the RPC wire carries no thrown
// Responses) — the unwrap helpers below translate the union back into the
// historical Responses so every route loader stays a one-liner. Exact
// status codes preserved: 301 canonical / 302 pagination / 304 ETag.

type ListingResult<T> = ContentRedirectSignal | { kind: 'ok'; listing: T }

/** Listing loaders (`content.home` / `posts.list` / `search`): NOT_FOUND →
 *  404, `redirect` → the thrown 301/302. Returns the ok listing. */
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

/** Detail loaders (`content.posts/pages.bySlug`): NOT_FOUND → 404,
 *  `not-modified` → the thrown 304, `redirect` → the canonical 301.
 *  Returns the ok etag + payload (the page variant's `etag` is nullable —
 *  draft previews carry no public ETag). */
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

// The comments + webmentions fan-out chained off the detail critical's
// comment key — shared by the post and page detail loaders so the two
// can't drift. Both promises stay un-awaited: the loaders pass them
// through `detail` untouched and `<Await>` streams them.
export function streamDetailExtras(
  caller: SsrCaller,
  commentKey: string,
): { comments: Promise<DetailPageComments>; webmentions: Promise<PublicWebmentionWire[]> } {
  return {
    comments: caller.content.comments.byKey({ pageKey: commentKey }),
    webmentions: caller.webmention.list({ page_key: commentKey }).then((r) => r.webmentions),
  }
}

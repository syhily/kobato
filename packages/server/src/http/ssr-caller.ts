import type { DetailPageComments } from '@kobato/contracts/comments'
import type { ContentNotModifiedSignal, ContentRedirectSignal, ContentSignal } from '@kobato/contracts/content'
import type { PublicWebmentionWire } from '@kobato/contracts/webmentions'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { ApiRouter } from '@kobato/server/http/api-router'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { LoaderFunctionArgs } from 'react-router'

import { apiRouter } from '@kobato/server/http/api-router'
import { orpcInputValidationInterceptor, type HandlerContext } from '@kobato/server/http/orpc-base'
import { createOrpcTraceInterceptor } from '@kobato/server/http/orpc-trace'
import { getRequestContext } from '@kobato/server/http/request-context'
import { notModifiedResponse } from '@kobato/server/infra/http/etag'
import { redirectPermanent } from '@kobato/server/infra/http/redirects'
import { notFound } from '@kobato/server/infra/http/status'
import { createRouterClient, ORPCError, type RouterClient } from '@orpc/server'
import { redirect } from 'react-router'

// In-process oRPC caller for SSR loaders: zero HTTP, zero serialization — `Date`s and
// un-awaited `Promise`s pass through untouched, so streaming stays intact.
export type SsrCaller = RouterClient<ApiRouter>

const ssrTraceInterceptor = createOrpcTraceInterceptor('in_process')

type SsrCallerArgs = {
  request: Request
  context: LoaderFunctionArgs['context']
}

export type SsrCallerResult = {
  caller: SsrCaller
  cspNonce: string
  /** The request's minted analytics event id — public loaders publish it as loader data `eid`. */
  analyticsEventId: string
  viewer: SessionUser | null
  session: BlogSession
  /**
   * The request's localization projection — `unwrapDetail` stamps a thrown 304 from THIS
   * object (never the global snapshot), so tag, language header and body agree.
   */
  localization: AppLocalization
}

export function createSsrCaller(args: SsrCallerArgs): SsrCallerResult {
  const rc = getRequestContext(args)
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
  return {
    caller: createRouterClient(apiRouter, {
      context,
      interceptors: [ssrTraceInterceptor, orpcInputValidationInterceptor],
    }),
    cspNonce: rc.cspNonce,
    analyticsEventId: rc.requestFacts.analyticsEventId,
    viewer: rc.viewer,
    session: rc.session,
    localization: rc.localization,
  }
}

export function isOrpcNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'NOT_FOUND'
}

type ListingResult<T> = ContentRedirectSignal | ContentNotModifiedSignal | { kind: 'ok'; etag: string; listing: T }

type ListingPayloadResult<T> = ContentNotModifiedSignal | { kind: 'ok'; etag: string; payload: T }

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

export function streamDetailExtras(
  caller: SsrCaller,
  commentKey: string,
): { comments: Promise<DetailPageComments>; webmentions: Promise<PublicWebmentionWire[]> } {
  return {
    comments: caller.content.comments.byKey({ pageKey: commentKey }),
    webmentions: caller.webmentions.list({ page_key: commentKey }).then((r) => r.webmentions),
  }
}

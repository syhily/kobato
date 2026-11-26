import type { KobatoServerClient } from '@kobato/api/client/create-server-client'
import type { KobatoResourceStream } from '@kobato/api/client/resource-stream'
import type {
  MediaResourceOutput,
  ResourceBinaryOk,
  ResourceOutput,
  ResourceRedirect,
} from '@kobato/api/contracts/primitives'
import type { DetailPageComments } from '@kobato/api/contracts/public/comments'
import type {
  ContentNotModifiedSignal,
  ContentRedirectSignal,
  ContentSignal,
} from '@kobato/api/contracts/public/content'
import type { PublicWebmentionWire } from '@kobato/api/contracts/public/webmentions'

import { ORPCError } from '@orpc/contract'
import { CACHE_PROFILES } from '@sayaka/server/headers'
import { redirect } from 'react-router'

export function isOrpcNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'NOT_FOUND'
}

export function sinkUnhandledRejection<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined)
  return promise
}

export function notFound(message = 'Not Found'): never {
  throw new Response(message, { status: 404 })
}

export function notModifiedResponse(etag: string, locale: string, profile: 'detail' | 'listing' = 'detail'): Response {
  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      'Content-Language': locale,
      'Cache-Control': CACHE_PROFILES[profile],
      Vary: 'Cookie',
    },
  })
}

type ListingResult<T> = ContentRedirectSignal | ContentNotModifiedSignal | { kind: 'ok'; etag: string; listing: T }

export async function unwrapListing<T>(
  promise: Promise<ListingResult<T>>,
  locale: string,
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
    throw notModifiedResponse(result.etag, locale, 'listing')
  }
  if (result.kind === 'redirect') {
    throw redirect(result.to, { status: result.status })
  }
  return { etag: result.etag, listing: result.listing }
}

type ListingPayloadResult<T> = ContentNotModifiedSignal | { kind: 'ok'; etag: string; payload: T }

export async function unwrapListingPayload<T>(
  promise: Promise<ListingPayloadResult<T>>,
  locale: string,
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
    throw notModifiedResponse(result.etag, locale, 'listing')
  }
  return { etag: result.etag, payload: result.payload }
}

export async function unwrapDetail<T, ETag extends string | null>(
  promise: Promise<ContentSignal | { kind: 'ok'; etag: ETag; payload: T }>,
  locale: string,
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
    throw notModifiedResponse(result.etag, locale)
  }
  if (result.kind === 'redirect') {
    throw redirect(result.to, { status: result.status })
  }
  return { etag: result.etag, payload: result.payload }
}

function resourceHeaders(
  answer: {
    contentType: string
    cacheControl: string
    contentLanguage: string | null
    etag?: string
  },
  profile: ResourceProfile | undefined,
): Headers {
  const headers = new Headers()
  headers.set('Content-Type', answer.contentType)
  headers.set('Cache-Control', answer.cacheControl)
  if (answer.contentLanguage !== null) {
    headers.set('Content-Language', answer.contentLanguage)
  }
  if (answer.etag !== undefined) {
    headers.set('ETag', answer.etag)
  }
  if (profile !== undefined) {
    headers.set('X-Content-Type-Options', 'nosniff')
  }
  if (profile === 'media') {
    headers.set('Accept-Ranges', 'bytes')
  }
  return headers
}

export type ResourceProfile = 'binary' | 'media'

export interface ResourceRouteOptions {
  profile?: ResourceProfile
  takeStream?: () => KobatoResourceStream | null
}

function translateResourceError(error: unknown, profile: ResourceProfile | undefined): unknown {
  if (!(error instanceof ORPCError)) {
    return error
  }
  if (error.code === 'NOT_FOUND') {
    notFound()
  }
  if (error.code === 'BAD_REQUEST') {
    throw emptyResponse(400, profile)
  }
  if (error.code === 'TOO_MANY_REQUESTS' || error.code === 'SERVICE_UNAVAILABLE') {
    throw new Response(error.message, {
      status: error.code === 'TOO_MANY_REQUESTS' ? 429 : 503,
      headers: textResponseHeaders(profile),
    })
  }
  return error
}

function emptyResponse(status: number, profile: ResourceProfile | undefined): Response {
  return new Response(null, { status, headers: profileHeaders(profile) })
}

function textResponseHeaders(profile: ResourceProfile | undefined): Headers {
  const headers = profileHeaders(profile)
  headers.set('Content-Type', 'text/plain; charset=utf-8')
  return headers
}

function profileHeaders(profile: ResourceProfile | undefined): Headers {
  const headers = new Headers()
  if (profile !== undefined) {
    headers.set('X-Content-Type-Options', 'nosniff')
  }
  return headers
}

function streamResponse(captured: KobatoResourceStream): Response {
  return new Response(captured.body, { status: captured.status, headers: captured.headers })
}

export type ResourceAnswer = ResourceOutput | MediaResourceOutput | ResourceBinaryOk | ResourceRedirect

export async function unwrapResource(
  promise: Promise<ResourceAnswer>,
  options?: ResourceRouteOptions,
): Promise<Response> {
  const profile = options?.profile
  let result: ResourceAnswer
  try {
    result = await promise
  } catch (error) {
    throw translateResourceError(error, profile)
  }
  if (typeof result !== 'object' || result === null || !('kind' in result)) {
    const captured = options?.takeStream?.() ?? null
    if (captured === null) {
      throw new Error('media procedure answered a stream without its captured transport')
    }
    return streamResponse(captured)
  }
  if (result.kind === 'not-modified') {
    return new Response(null, { status: 304, headers: resourceHeaders(result, profile) })
  }
  if (result.kind === 'redirect') {
    const headers = profileHeaders(profile)
    headers.set('Location', result.location)
    if (result.cacheControl !== null) {
      headers.set('Cache-Control', result.cacheControl)
    }
    return new Response(null, { status: 302, headers })
  }
  if (result.kind === 'range-not-satisfiable') {
    const headers = resourceHeaders(result, profile)
    headers.set('Content-Range', result.contentRange)
    return new Response(null, { status: 416, headers })
  }
  return new Response(result.body, {
    status: 200,
    headers: resourceHeaders(result, profile),
  })
}

export function streamDetailExtras(
  client: KobatoServerClient['client'],
  commentKey: string,
): { comments: Promise<DetailPageComments>; webmentions: Promise<PublicWebmentionWire[]> } {
  return {
    comments: client.public.content.comments.byKey({ pageKey: commentKey }),
    webmentions: client.public.webmentions.list({ page_key: commentKey }).then((r) => r.webmentions),
  }
}

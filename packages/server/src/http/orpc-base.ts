import type { Database } from '@kobato/db/database.ts'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage.ts'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts.ts'
import type { BlogSettingsBundle } from '@kobato/shared/config/types.ts'
import type { ErrorMessageDescriptor, ErrorMessageParams } from '@kobato/shared/contracts/api-error.ts'
import type { AppLocalization } from '@kobato/shared/i18n/app-localization.ts'
import type { UiMessageId } from '@kobato/shared/i18n/messages/ui/en-US.ts'
import type { CommentTokenCookie } from '@kobato/shared/utils/comment-token.ts'
import type { z } from 'zod'

import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate.ts'
import {
  apiErrorData,
  summarizeApiError,
  translateApiError,
  translateDomainError,
} from '@kobato/server/http/translate-domain-error.ts'
import { descriptorFor, zodIssuesToWire } from '@kobato/server/infra/http/error-descriptor.ts'
import { ActionFailure, DomainError, ErrorMessages } from '@kobato/server/infra/http/errors.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import {
  tryCommentPostRateLimit,
  tryNotificationReplyRateLimit,
  tryResourceRateLimit,
} from '@kobato/server/infra/rate-limit.ts'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@kobato/shared/utils/comment-token.ts'
import { hasAtLeast, type Role } from '@kobato/shared/utils/roles.ts'
import { ORPCError, os } from '@orpc/server'

// Context every oRPC procedure sees — `responseHeaders` merges onto the final `Response`.
export interface HandlerContext {
  request: Request
  /** Transport-agnostic facts extracted by the bridge; services never touch the raw `Request`. */
  requestFacts: RequestFacts
  session: BlogSession
  viewer: SessionUser | null
  clientAddress: string
  responseHeaders: Headers
  db: Database
  /** The request's pinned settings bundle (same capture as `localization`). */
  settings: BlogSettingsBundle | null
  localization: AppLocalization
}

// Narrowed by `requireAuth`/`requireRole`: `viewer` is guaranteed non-null.
export interface AuthedHandlerContext extends Omit<HandlerContext, 'viewer'> {
  viewer: SessionUser
}

const root = os.$context<HandlerContext>()

export type OrpcErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TOO_MANY_REQUESTS'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_SERVER_ERROR'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE'

/**
 * A localized `ORPCError` for gates and controllers that bypass the domain guard: the
 * descriptor rides `data`, so the client never has to know the copy.
 */
export function localizedOrpcError(
  context: HandlerContext,
  code: OrpcErrorCode,
  messageKey: UiMessageId,
  params?: ErrorMessageParams,
): ORPCError<OrpcErrorCode, unknown> {
  return localizedOrpcErrorDescriptor(context, code, descriptorFor(messageKey, params))
}

/** Variant for callers that already built the descriptor (e.g. a domain helper's result). */
export function localizedOrpcErrorDescriptor(
  context: HandlerContext,
  code: OrpcErrorCode,
  descriptor: ErrorMessageDescriptor,
): ORPCError<OrpcErrorCode, unknown> {
  const translator = createServerTranslator(context.localization.locale)
  return new ORPCError(code, {
    message: translator.format(descriptor.messageKey, descriptor.params),
    data: { descriptor },
  })
}

// Translate domain failures to `ORPCError` — foreign exceptions become a generic 500.
const domainErrorGuard = root.middleware(async ({ context, next }) => {
  try {
    return await next({})
  } catch (error) {
    if (error instanceof DomainError || error instanceof ActionFailure) {
      const translator = createServerTranslator(context.localization.locale)
      const translated = translateDomainError(error, translator)
      // Failure headers (e.g. `Retry-After`) ride the bridge's `responseHeaders` channel.
      if (translated.headers) {
        new Headers(translated.headers).forEach((value, key) => {
          context.responseHeaders.append(key, value)
        })
      }
      // The server-localized message names the failing fields; the descriptor and issue
      // paths ride `data` for consumers that map fields.
      throw new ORPCError(error instanceof DomainError ? error.code : 'INTERNAL_SERVER_ERROR', {
        status: translated.status,
        message: summarizeApiError(translated, translator),
        data: apiErrorData(translated),
      })
    }
    throw error
  }
})

export async function orpcInputValidationInterceptor<TOutput>(options: {
  context: HandlerContext
  next(): Promise<TOutput>
}): Promise<TOutput> {
  try {
    return await options.next()
  } catch (error) {
    if (!(error instanceof ORPCError) || error.code !== 'BAD_REQUEST') {
      throw error
    }
    const data: unknown = error.data
    const rawIssues: unknown = Array.isArray(data)
      ? data
      : typeof data === 'object' && data !== null && 'issues' in data && !('descriptor' in data)
        ? data.issues
        : undefined
    if (!Array.isArray(rawIssues)) {
      throw error
    }
    const issues = rawIssues as readonly z.core.$ZodIssue[]
    const translator = createServerTranslator(options.context.localization.locale)
    const translated = translateApiError(
      {
        status: 400,
        code: 'BAD_REQUEST',
        message: ErrorMessages.INVALID_INPUT,
        issues: zodIssuesToWire(issues, translator),
      },
      translator,
    )
    throw new ORPCError('BAD_REQUEST', {
      status: translated.status,
      message: summarizeApiError(translated, translator),
      data: apiErrorData(translated),
    })
  }
}

function ensureViewer(context: HandlerContext): SessionUser {
  if (!context.viewer) {
    throw localizedOrpcError(context, 'UNAUTHORIZED', 'error.api.unauthorized')
  }
  return context.viewer
}

const requireAuth = root.middleware(({ context, next }) => {
  const viewer = ensureViewer(context)
  return next({
    context: {
      ...context,
      viewer,
    } satisfies AuthedHandlerContext,
  })
})

// Throws ORPCError('FORBIDDEN') unless `viewer.role` is at least `role`.
function requireRole(role: Role) {
  return root.middleware(({ context, next }) => {
    const viewer = ensureViewer(context)
    if (!hasAtLeast(viewer.role, role)) {
      throw localizedOrpcError(context, 'FORBIDDEN', 'error.api.insufficientPermissions')
    }
    return next({
      context: {
        ...context,
        viewer,
      } satisfies AuthedHandlerContext,
    })
  })
}

// Rate-limit guard for expensive public procedures — `resource` bucket; Hono routes use `rateLimitByIp`.
export const resourceRateLimit = root.middleware(async ({ context, next }) => {
  const { exceeded } = await tryResourceRateLimit(context.clientAddress)
  if (exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.rateLimited')
  }
  return next({})
})

/**
 * Must be placed BEFORE `.input(...)`: comment bodies carry a whole Lexical state, so
 * oRPC would otherwise parse a ≤10 MB schema before the bucket is consulted. Admins exempt.
 */
export const commentPostRateLimit = root.middleware(async ({ context, next }) => {
  if (context.viewer?.role === 'admin') {
    return next({})
  }
  const { exceeded } = await tryCommentPostRateLimit(context.clientAddress)
  if (exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.rateLimited')
  }
  return next({})
})

/**
 * Per-user reply throttle: the per-IP pool cannot stop one invited account from fanning
 * replies into every inbox and mailing the whole admin team. Requires `requireAuth`.
 */
export const notificationReplyRateLimit = root.middleware(async ({ context, next }) => {
  if (context.viewer?.role === 'admin') {
    return next({})
  }
  const { exceeded } = await tryNotificationReplyRateLimit(context.viewer!.id)
  if (exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.replyRateLimited')
  }
  return next({})
})

// Passkey guard: disabled → `DomainError('BAD_REQUEST')`, translated by `domainErrorGuard`.
export const passkeyGuard = root.middleware(({ next }) => {
  if (!isPasskeyEnabled()) {
    throw new DomainError('BAD_REQUEST', descriptorFor('error.api.passkeyDisabled'))
  }
  return next({})
})

// Single owner of the `__comment_tokens` parse → Set-Cookie dance; the write-back runs
// in a `finally` so it survives throws.
export interface CommentTokenCookieJar {
  cookie: CommentTokenCookie
  /** Assign the cleaned cookie here to schedule the `Set-Cookie` refresh. */
  refreshed?: CommentTokenCookie
}

export const commentTokenCookie = root.middleware(async ({ context, next }) => {
  const jar: CommentTokenCookieJar = {
    cookie: parseCommentTokensCookie(context.requestFacts.cookie),
  }
  try {
    return await next({ context: { ...context, commentTokens: jar } })
  } finally {
    if (jar.refreshed !== undefined) {
      context.responseHeaders.append('Set-Cookie', serializeCommentTokensCookie(jar.refreshed))
    }
  }
})

export const publicProc = root.use(domainErrorGuard)

export const authedProc = root.use(requireAuth).use(domainErrorGuard)

export const adminProc = root.use(requireRole('admin')).use(domainErrorGuard)
export const authorProc = root.use(requireRole('author')).use(domainErrorGuard)

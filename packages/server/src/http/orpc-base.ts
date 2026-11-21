import type { ErrorMessageDescriptor, ErrorMessageParams } from '@kobato/contracts/api-error'
import type { Database } from '@kobato/db/database'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { CommentTokenCookie } from '@kobato/server/domains/comments/services/comment-token'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts'
import type { AppLocalization } from '@kobato/settings/app-localization'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { AnyContractRouter } from '@orpc/contract'
import type { z } from 'zod'

import { hasAtLeast, type Role } from '@kobato/auth/roles'
import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate'
import {
  parseCommentTokensCookie,
  serializeCommentTokensCookie,
} from '@kobato/server/domains/comments/services/comment-token'
import {
  apiErrorData,
  summarizeApiError,
  translateApiError,
  translateDomainError,
} from '@kobato/server/http/translate-domain-error'
import { descriptorFor, zodIssuesToWire } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure, DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import {
  tryCommentPostRateLimit,
  tryNotificationReplyRateLimit,
  tryResourceRateLimit,
} from '@kobato/server/infra/rate-limit'
import { implementerInternal, ORPCError, os } from '@orpc/server'

export interface HandlerContext {
  request: Request
  requestFacts: RequestFacts
  session: BlogSession
  viewer: SessionUser | null
  clientAddress: string
  responseHeaders: Headers
  db: Database
  settings: BlogSettingsBundle | null
  localization: AppLocalization
}

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

export function localizedOrpcError(
  context: HandlerContext,
  code: OrpcErrorCode,
  messageKey: UiMessageId,
  params?: ErrorMessageParams,
): ORPCError<OrpcErrorCode, unknown> {
  return localizedOrpcErrorDescriptor(context, code, descriptorFor(messageKey, params))
}

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

const domainErrorGuard = root.middleware(async ({ context, next }) => {
  try {
    return await next({})
  } catch (error) {
    if (error instanceof DomainError || error instanceof ActionFailure) {
      const translator = createServerTranslator(context.localization.locale)
      const translated = translateDomainError(error, translator)
      if (translated.headers) {
        new Headers(translated.headers).forEach((value, key) => {
          context.responseHeaders.append(key, value)
        })
      }
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

export const resourceRateLimit = root.middleware(async ({ context, next }) => {
  const { exceeded } = await tryResourceRateLimit(context.clientAddress)
  if (exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.rateLimited')
  }
  return next({})
})

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

export const passkeyGuard = root.middleware(({ next }) => {
  if (!isPasskeyEnabled()) {
    throw new DomainError('BAD_REQUEST', descriptorFor('error.api.passkeyDisabled'))
  }
  return next({})
})

export interface CommentTokenCookieJar {
  cookie: CommentTokenCookie
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

export function implementPublic<T extends AnyContractRouter>(contract: T) {
  return implementerInternal<T, HandlerContext, HandlerContext>(contract, {}, [domainErrorGuard])
}

export function implementAuthed<T extends AnyContractRouter>(contract: T) {
  return implementerInternal<T, HandlerContext, AuthedHandlerContext>(contract, {}, [requireAuth, domainErrorGuard])
}

export function implementAuthor<T extends AnyContractRouter>(contract: T) {
  return implementerInternal<T, HandlerContext, AuthedHandlerContext>(contract, {}, [
    requireRole('author'),
    domainErrorGuard,
  ])
}

export function implementAdmin<T extends AnyContractRouter>(contract: T) {
  return implementerInternal<T, HandlerContext, AuthedHandlerContext>(contract, {}, [
    requireRole('admin'),
    domainErrorGuard,
  ])
}

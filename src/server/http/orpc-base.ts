import { ORPCError, os } from '@orpc/server'

import type { BlogSession, SessionUser } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'
import type { RequestFacts } from '@/server/infra/http/request-facts'
import type { CommentTokenCookie } from '@/shared/utils/comment-token'

import { isPasskeyEnabled } from '@/server/domains/auth/passkey/gate'
import { translateDomainError } from '@/server/http/translate-domain-error'
import { ActionFailure, DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { parseCommentTokensCookie, serializeCommentTokensCookie } from '@/shared/utils/comment-token'
import { hasAtLeast, type Role } from '@/shared/utils/roles'

// Context every oRPC procedure sees — `responseHeaders` merges onto the final `Response`.
export interface HandlerContext {
  request: Request
  /** Transport-agnostic facts extracted by the bridge; services never touch the raw `Request`. */
  requestFacts: RequestFacts
  session: BlogSession
  /** The session's identity projection (full `SessionUser`); `null` when anonymous. */
  viewer: SessionUser | null
  clientAddress: string
  responseHeaders: Headers
  db: Database
}

// Narrowed by `requireAuth`/`requireRole`: `viewer` is guaranteed non-null.
export interface AuthedHandlerContext extends Omit<HandlerContext, 'viewer'> {
  viewer: SessionUser
}

const root = os.$context<HandlerContext>()

// Translate domain failures to `ORPCError` — foreign exceptions become a generic 500.
const domainErrorGuard = root.middleware(async ({ context, next }) => {
  try {
    return await next({})
  } catch (error) {
    if (error instanceof DomainError || error instanceof ActionFailure) {
      const translated = translateDomainError(error)
      // Failure headers (e.g. `Retry-After`) ride the bridge's `responseHeaders` channel.
      if (translated.headers) {
        new Headers(translated.headers).forEach((value, key) => {
          context.responseHeaders.append(key, value)
        })
      }
      // Forward the issue list so API consumers can map errors back to fields.
      throw new ORPCError(error instanceof DomainError ? error.code : 'INTERNAL_SERVER_ERROR', {
        status: translated.status,
        message: translated.message,
        ...(translated.issues ? { data: translated.issues } : {}),
      })
    }
    throw error
  }
})

function ensureViewer(context: HandlerContext): SessionUser {
  if (!context.viewer) {
    throw new ORPCError('UNAUTHORIZED', { message: ErrorMessages.UNAUTHORIZED })
  }
  return context.viewer
}

// Throws ORPCError('UNAUTHORIZED') if no session user.
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
      throw new ORPCError('FORBIDDEN', { message: ErrorMessages.INSUFFICIENT_PERMISSIONS })
    }
    return next({
      context: {
        ...context,
        viewer,
      } satisfies AuthedHandlerContext,
    })
  })
}

// Rate-limit guard for expensive public procedures — `resourceIp` bucket; Hono routes use `rateLimitByIp`.
export const resourceRateLimit = root.middleware(async ({ context, next }) => {
  const { exceeded } = await tryResourceRateLimit(context.clientAddress)
  if (exceeded) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
  }
  return next({})
})

// Passkey guard: disabled → `DomainError('BAD_REQUEST')`, translated by `domainErrorGuard`.
export const passkeyGuard = root.middleware(({ next }) => {
  if (!isPasskeyEnabled()) {
    throw new DomainError('BAD_REQUEST', 'Passkey 登录未启用。')
  }
  return next({})
})

// Single owner of the `__comment_tokens` parse → Set-Cookie dance; the write-back runs in a `finally` so it survives throws.
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

// No auth gate — public mutations rely on session authentication.
export const publicProc = root.use(domainErrorGuard)

// Any logged-in user; narrows `context.viewer` to `SessionUser`.
export const authedProc = root.use(requireAuth).use(domainErrorGuard)

// `adminProc` is admin-only; `authorProc` requires author or admin.
export const adminProc = root.use(requireRole('admin')).use(domainErrorGuard)
export const authorProc = root.use(requireRole('author')).use(domainErrorGuard)

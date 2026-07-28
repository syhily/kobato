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

// Context every oRPC procedure sees. The Hono `/rpc/*` bridge in
// `app.ts` projects it from `c.var.requestContext` (the canonical
// per-request fact base) after the perimeter middleware has run.
//
// `responseHeaders` is a mutable bag the procedure can append to
// (e.g. `Set-Cookie` for comment-token issuance).
// The Hono bridge merges entries onto the final `Response` after
// `RPCHandler.handle()` resolves — oRPC's RPC wire format doesn't
// have a per-procedure header channel, so this is the bridge's job.
export interface HandlerContext {
  request: Request
  /**
   * Transport-agnostic facts extracted from `request` by the bridge
   * (`extractRequestFacts`). Domain services receive this struct and
   * never touch the raw `Request`.
   */
  requestFacts: RequestFacts
  session: BlogSession
  /** The session's identity projection (full `SessionUser`); `null` when anonymous. */
  viewer: SessionUser | null
  clientAddress: string
  responseHeaders: Headers
  db: Database
}

// Subtype produced by `requireAuth` — once an auth middleware passes,
// `viewer` is guaranteed non-null. oRPC's `.use()` chaining propagates
// this narrowed context to the procedure handler automatically.
export interface AuthedHandlerContext extends Omit<HandlerContext, 'viewer'> {
  viewer: SessionUser
}

// ─── Root procedure builder ─────────────────────────────
// `os.$context<T>()` declares the initial-context type. All four
// procedure flavours below extend from this same root so the
// `Hono → context` plumbing in `app.ts` is type-safe end-to-end.
const root = os.$context<HandlerContext>()

// oRPC only recognises its own `ORPCError`. Any other exception
// (including our `DomainError`) is silently converted to a generic
// 500 "Internal server error" — losing the domain code and message.
// This middleware intercepts domain-layer failures (`DomainError` /
// `ActionFailure`) before oRPC swallows them and translates them to an
// `ORPCError` with the correct HTTP status. The translation itself is
// shared with the Hono adapter via `translateDomainError`, so both
// transports honor the same status, message, issues, and headers.
const domainErrorGuard = root.middleware(async ({ context, next }) => {
  try {
    return await next({})
  } catch (error) {
    if (error instanceof DomainError || error instanceof ActionFailure) {
      const translated = translateDomainError(error)
      // Failure headers (e.g. rate-limit `Retry-After`) ride the
      // bridge's `responseHeaders` channel — the RPC wire format has no
      // per-procedure header channel of its own.
      if (translated.headers) {
        new Headers(translated.headers).forEach((value, key) => {
          context.responseHeaders.append(key, value)
        })
      }
      // Forward the issue list (e.g. strict settings-patch keys) so API
      // consumers can map errors back to fields — one translation point
      // for every procedure, not per-controller catches.
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

// ─── Middleware: require a logged-in user ───────────────
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

// ─── Middleware: require role >= threshold ──────────────
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

// ─── Middleware: shared per-IP resource rate limit ──────
// Guard for public procedures that proxy upstream services or render
// expensive payloads. Reads the `resourceIp` bucket via
// `tryResourceRateLimit` and throws the same ORPCError the per-controller
// inline copies used to throw, so the RPC wire shape is byte-identical.
// Runs after input validation (oRPC validates at the index captured when
// `.input()` was called — before any `.use()` added afterwards), matching
// the old "first statement of the handler" order. Hono resource routes
// use the parallel `rateLimitByIp` seam in `middlewares/rate-limit.ts`.
export const resourceRateLimit = root.middleware(async ({ context, next }) => {
  const { exceeded } = await tryResourceRateLimit(context.clientAddress)
  if (exceeded) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
  }
  return next({})
})

// ─── Middleware: passkey feature gate ───────────────────
// Guard for the passkey procedures (account registration/management,
// public auth-begin, admin clear). Reads the settings-bundle flag via
// `isPasskeyEnabled` and throws the one canonical DomainError the old
// inline copies drifted between (ORPCError in controllers, DomainError
// in the public controller) — `domainErrorGuard` translates it to the
// same ORPCError('BAD_REQUEST') wire shape for every base. Mount via
// `.use()` after `.input()`/`.output()`, matching `resourceRateLimit`.
export const passkeyGuard = root.middleware(({ next }) => {
  if (!isPasskeyEnabled()) {
    throw new DomainError('BAD_REQUEST', 'Passkey 登录未启用。')
  }
  return next({})
})

// ─── Middleware: comment-token cookie round trip ────────
// Single owner of the `__comment_tokens` parse → verify/clean →
// Set-Cookie dance for the public comment procedures. The middleware
// parses the request cookie before the handler runs; the handler reads
// `context.commentTokens.cookie`, runs the domain verify/cleanup, and
// assigns the cleaned value to `context.commentTokens.refreshed` — the
// middleware then serializes it as the `Set-Cookie` refresh. No
// assignment → no Set-Cookie. The write-back lives in a `finally` so a
// handler that assigns and then throws (e.g. valid token but missing
// comment) still refreshes the cookie, matching the old inline order.
export interface CommentTokenCookieJar {
  /** The parsed `__comment_tokens` cookie carried by the request. */
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

// ─── Public base procedure ──────────────────────────────
// No auth gate. Public mutations rely on session authentication.
export const publicProc = root.use(domainErrorGuard)

// ─── Authed base procedure ──────────────────────────────
// Any logged-in user (admin / author / visitor). After this middleware
// resolves, `context.viewer` is typed as `SessionUser` (non-null).
export const authedProc = root.use(requireAuth).use(domainErrorGuard)

// ─── Role-gated base procedures ─────────────────────────
// `adminProc` is admin-only. `authorProc` requires author or admin
// (per `hasAtLeast`). Each procedure file picks one of these four
// bases and the leaf inherits the matching guard.
export const adminProc = root.use(requireRole('admin')).use(domainErrorGuard)
export const authorProc = root.use(requireRole('author')).use(domainErrorGuard)

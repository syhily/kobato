import type { BlogSession, SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { Database } from '@kobato/server/infra/db/database'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts'
import type { CommentTokenCookie } from '@kobato/shared/utils/comment-token'

import { verifyFrontendJwt } from '@kobato/server/domains/apikey/service'
import { isPasskeyEnabled } from '@kobato/server/domains/auth/passkey/gate'
import { resolveSessionFromTokenHeader } from '@kobato/server/domains/auth/primitives'
import { translateDomainError } from '@kobato/server/http/translate-domain-error'
import { ActionFailure, DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { tryResourceRateLimit } from '@kobato/server/infra/rate-limit'
import { X_KOBATO_SESSION_TOKEN } from '@kobato/shared/http/session-bridge'
import {
  parseCommentTokenHeader,
  parseCommentTokensCookie,
  serializeCommentTokensCookie,
} from '@kobato/shared/utils/comment-token'
import { hasAtLeast, type Role } from '@kobato/shared/utils/roles'
import { ORPCError, os } from '@orpc/server'

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
  let cookie = parseCommentTokensCookie(context.requestFacts.cookie)
  // Proxy-chain jar merge (phase 0.6): the frontend proxy carries the
  // visitor's token jar in `X-Kobato-Comment-Token` — the first-party
  // `__comment_tokens` cookie mirrored onto the header so the frontend
  // never forwards raw cookies. The header is a bearer credential, so it
  // is honoured ONLY behind a valid frontend JWT (`frontendKeyAuth` must
  // run first — the controllers mount it ahead of this middleware);
  // anonymous requests cannot inject tokens they do not own. The
  // `frontendAuth` projection is not part of the base `HandlerContext`,
  // so the read is defensive: standalone mounts simply skip the merge.
  const frontendAuth = (context as HandlerContext & { frontendAuth?: FrontendAuth | null }).frontendAuth
  if (frontendAuth !== null && frontendAuth !== undefined) {
    const header = context.request.headers.get('X-Kobato-Comment-Token')
    if (header !== null && header !== '') {
      const parsed = parseCommentTokenHeader(header)
      if (Object.keys(parsed).length > 0) {
        cookie = { ...cookie, ...parsed }
      }
    }
  }
  const jar: CommentTokenCookieJar = {
    cookie,
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

// ─── Role-gated base procedures ─────────────────────────
// `adminProc` is admin-only. `authorProc` requires author or admin
// (per `hasAtLeast`). Each procedure file picks one of these four
// bases and the leaf inherits the matching guard.
export const adminProc = root.use(requireRole('admin')).use(domainErrorGuard)
export const authorProc = root.use(requireRole('author')).use(domainErrorGuard)

// ─── Middleware: frontend key auth (phase 0.6 proxy contract) ──
// The write-interaction chain (comments / likes / newsletter submits /
// friends apply) is proxied by the frontend program, which signs
// short-lived EdDSA JWTs with its registered key and attaches
// `Authorization: Bearer …`. This middleware verifies the token when
// present and projects the result onto `context.frontendAuth` (optional:
// anonymous forwards still work — comment creation is open — but core
// then honours none of the forwarding headers). It enforces the trust
// rules the split needs:
//   - `X-Forwarded-*` headers are only honoured behind a valid key — an
//     anonymous request's forged forwarding headers are ignored;
//   - the `X-Kobato-Session-Token` member-session bridge is only
//     resolved behind a valid key (the header carries the signed
//     `__session` cookie value, see `shared/http/session-bridge`).

export interface FrontendAuth {
  keyId: string
  scopes: string[]
  /** The proxy-supplied visitor address (`X-Forwarded-For`), trusted
   *  ONLY because a valid key authenticated this request. */
  forwardedAddress: string | null
}

export const frontendKeyAuth = root.middleware(async ({ context, next }) => {
  const header = context.request.headers.get('Authorization')
  let frontendAuth: FrontendAuth | null = null
  let forwardedUa: string | null = null
  let headerSession: BlogSession | null = null
  let headerViewer: SessionUser | null = null
  if (header !== null && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length)
    const verified = await verifyFrontendJwt(context.db, token)
    if (verified !== null) {
      const forwarded = context.request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? null
      frontendAuth = { keyId: verified.keyId, scopes: verified.scopes, forwardedAddress: forwarded }
      forwardedUa = context.request.headers.get('X-Forwarded-User-Agent')
      // Member session bridge (phase 0.6 §6): the frontend program relays
      // the visitor's own-domain `__session` cookie as
      // `X-Kobato-Session-Token`. Like the `X-Forwarded-*` family, the
      // header is a bearer credential honoured ONLY behind a valid frontend
      // JWT — an anonymous request cannot inject a session it does not own.
      const sessionToken = context.request.headers.get(X_KOBATO_SESSION_TOKEN)
      if (sessionToken !== null && sessionToken !== '') {
        const resolved = await resolveSessionFromTokenHeader(context.db, sessionToken)
        if (resolved.user !== undefined) {
          headerSession = resolved.session
          headerViewer = resolved.user
        }
      }
    }
  }
  // Trusted forwarding behind a valid key (phase 0.6): the proxy-supplied
  // visitor address and UA override the transport's own, so rate-limit
  // buckets, audit rows and comment metadata see the visitor instead of
  // the frontend server. Anonymous requests never reach the override —
  // the X-Forwarded-* headers of an unauthenticated request stay ignored.
  // The projection is typed once (not per branch) so the downstream
  // handler context keeps `frontendAuth: FrontendAuth | null`.
  const projected: HandlerContext & { frontendAuth: FrontendAuth | null } = {
    ...context,
    frontendAuth,
    ...(headerSession !== null && headerViewer !== null ? { session: headerSession, viewer: headerViewer } : {}),
    ...(frontendAuth !== null
      ? {
          clientAddress: frontendAuth.forwardedAddress ?? context.clientAddress,
          requestFacts:
            forwardedUa !== null && forwardedUa !== ''
              ? { ...context.requestFacts, userAgent: forwardedUa }
              : context.requestFacts,
        }
      : {}),
  }
  return next({ context: projected })
})

// ─── Authed base procedure ──────────────────────────────
// Any logged-in user (admin / author / visitor). After this middleware
// resolves, `context.viewer` is typed as `SessionUser` (non-null).
// `frontendKeyAuth` runs FIRST so the member session bridge
// (`X-Kobato-Session-Token`, honoured only behind a valid frontend JWT)
// and the forwarded visitor facts apply to authed reads too — the
// headless "需身份读" procedures (load-mine etc.) are proxied by the
// frontend program exactly like the write interactions (plan 0.6 §6).
export const authedProc = root.use(frontendKeyAuth).use(requireAuth).use(domainErrorGuard)

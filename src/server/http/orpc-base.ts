import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { ORPCError, os } from '@orpc/server'

import type { ViewerContext } from '@/server/domains/auth/rbac'
import type { Env } from '@/server/http/context'

import { ActionFailure, DomainError, domainStatus, ErrorMessages } from '@/server/infra/http/errors'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { hasAtLeast, type Role } from '@/shared/utils/roles'

// Context every oRPC procedure sees. The Hono `/rpc/*` bridge in
// `app.ts` builds this from `c.var` after the perimeter middleware
// (session / install-gate / visitor-cookie / wp-decoy) has run.
//
// `responseHeaders` is a mutable bag the procedure can append to
// (e.g. `Set-Cookie` for comment-token issuance).
// The Hono bridge merges entries onto the final `Response` after
// `RPCHandler.handle()` resolves — oRPC's RPC wire format doesn't
// have a per-procedure header channel, so this is the bridge's job.
export interface HandlerContext {
  request: Request
  session: Env['Variables']['session']
  viewer: ViewerContext | null
  clientAddress: string
  responseHeaders: Headers
  db: NodePgDatabase
  pool: Pool
}

// Subtype produced by `requireAuth` — once an auth middleware passes,
// `viewer` is guaranteed non-null. oRPC's `.use()` chaining propagates
// this narrowed context to the procedure handler automatically.
export interface AuthedHandlerContext extends Omit<HandlerContext, 'viewer'> {
  viewer: ViewerContext
}

// ─── Root procedure builder ─────────────────────────────
// `os.$context<T>()` declares the initial-context type. All four
// procedure flavours below extend from this same root so the
// `Hono → context` plumbing in `app.ts` is type-safe end-to-end.
const root = os.$context<HandlerContext>()

// oRPC only recognises its own `ORPCError`. Any other exception
// (including our `DomainError`) is silently converted to a generic
// 500 "Internal server error" — losing the domain code and message.
// This middleware intercepts `DomainError` before oRPC swallows it
// and translates it to an `ORPCError` with the correct HTTP status.
const domainErrorGuard = root.middleware(async ({ next }) => {
  try {
    return await next({})
  } catch (error) {
    if (error instanceof DomainError) {
      // Forward the issue list (e.g. strict settings-patch keys) so API
      // consumers can map errors back to fields — one translation point
      // for every procedure, not per-controller catches.
      throw new ORPCError(error.code, {
        status: domainStatus(error),
        message: error.message,
        ...(error.issues ? { data: error.issues } : {}),
      })
    }
    if (error instanceof ActionFailure) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        status: error.status,
        message: error.message,
      })
    }
    throw error
  }
})

function ensureViewer(context: HandlerContext): ViewerContext {
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

// ─── Public base procedure ──────────────────────────────
// No auth gate. Public mutations rely on session authentication.
export const publicProc = root.use(domainErrorGuard)

// ─── Authed base procedure ──────────────────────────────
// Any logged-in user (admin / author / visitor). After this middleware
// resolves, `context.viewer` is typed as `ViewerContext` (non-null).
export const authedProc = root.use(requireAuth).use(domainErrorGuard)

// ─── Role-gated base procedures ─────────────────────────
// `adminProc` is admin-only. `authorProc` requires author or admin
// (per `hasAtLeast`). Each procedure file picks one of these four
// bases and the leaf inherits the matching guard.
export const adminProc = root.use(requireRole('admin')).use(domainErrorGuard)
export const authorProc = root.use(requireRole('author')).use(domainErrorGuard)

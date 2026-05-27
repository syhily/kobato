import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { ORPCError, os } from '@orpc/server'

import type { Env } from '@/server/http/context'

import { hasAtLeast, type Role, type ViewerContext } from '@/server/domains/auth/rbac'
import { ErrorMessages } from '@/server/infra/http/errors'

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

function ensureViewer(context: HandlerContext): ViewerContext {
  const user = context.session.get('user')
  if (!user) {
    throw new ORPCError('UNAUTHORIZED', { message: ErrorMessages.UNAUTHORIZED })
  }
  return { userId: user.id, role: user.role }
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

// ─── Public base procedure ──────────────────────────────
// No auth gate. Public mutations rely on session authentication.
export const publicProc = root

// ─── Authed base procedure ──────────────────────────────
// Any logged-in user (admin / author / visitor). After this middleware
// resolves, `context.viewer` is typed as `ViewerContext` (non-null).
export const authedProc = root.use(requireAuth)

// ─── Role-gated base procedures ─────────────────────────
// `adminProc` is admin-only. `authorProc` requires author or admin
// (per `hasAtLeast`). Each procedure file picks one of these four
// bases and the leaf inherits the matching guard.
export const adminProc = root.use(requireRole('admin'))
export const authorProc = root.use(requireRole('author'))

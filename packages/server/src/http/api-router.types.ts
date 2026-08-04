import type { apiRouter } from '@kobato/server/http/api-router'

/**
 * The oRPC router type — the single type-level exit from the server
 * graph consumed by browser clients (`client/api/client.ts`).
 *
 * Deliberately a type-only re-export (an exception to the no-facade
 * rule, pinned by the boundaries contract test): the router instance
 * itself must never be dragged into a client bundle, only its type
 * shape. When the server becomes its own package this file is what the
 * `@kobato/server` `types` subpath forwards.
 */
export type ApiRouter = typeof apiRouter

/** The headless Content API surface (`apiRouter.content` + the public
 *  comments router — the frontend fans comments out for streaming), typed
 *  for the public client. */
export type ContentPublicRouter = typeof apiRouter.content & {
  comments: typeof apiRouter.comments
}

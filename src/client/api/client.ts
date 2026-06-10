import type { RouterClient } from '@orpc/server'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

import type { ApiRouter } from '@/server/http/api-router'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

/**
 * Typed oRPC client. Every procedure under `apiRouter` is available
 * as a strongly-typed async function — input/output types flow from
 * the server-side `ApiRouter` type definition.
 *
 *   const { user } = await orpc.admin.users.get({ id: '42' })
 *   await orpc.admin.users.mute({ id: '42', muted: true })
 *
 * Errors thrown by the server are normalized client-side as
 * `ORPCError` instances.
 */
const link = new RPCLink({
  // RPCLink does `new URL(baseUrl)` internally and the `URL` constructor
  // throws on relative inputs ("Invalid URL"), so we resolve `/rpc`
  // against `location.origin` lazily. Lazy because:
  //   - `client.ts` is allowed to import-transitively from SSR-side
  //     code (typing only), so we must NOT touch `window` at module
  //     load — the function is only invoked once a request actually
  //     fires, which by construction is the browser.
  //   - Storybook / Vitest may stub `location`; reading it per-call
  //     instead of once-at-construction keeps those overrides honest.
  url: () => `${globalThis.location?.origin ?? 'http://localhost'}/rpc`,
  headers: () => {
    const h: Record<string, string> = {}
    if (csrfStore.token) {
      h['X-CSRF-Token'] = csrfStore.token
    }
    return h
  },
})

export const orpc: RouterClient<ApiRouter> = createORPCClient(link)

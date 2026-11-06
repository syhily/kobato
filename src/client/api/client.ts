import type { RouterClient } from '@orpc/server'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

import type { ApiRouter } from '@/server/http/api-router'

import { enrichApiErrorMessage } from '@/shared/utils/api-error'

const csrfStore = { token: null as string | null }

export function setCsrfToken(token: string) {
  csrfStore.token = token
}

/**
 * Typed oRPC client: every `apiRouter` procedure is a strongly-typed async
 * function; errors normalize as `ORPCError`.
 */
const link = new RPCLink({
  // RPCLink's `new URL(baseUrl)` throws on relative inputs, so resolve `/rpc`
  // against `location.origin` lazily per call — never at module load.
  url: () => `${globalThis.location?.origin ?? 'http://localhost'}/rpc`,
  headers: () => {
    const h: Record<string, string> = {}
    if (csrfStore.token) {
      h['X-CSRF-Token'] = csrfStore.token
    }
    return h
  },
  // Validation rejections carry their zod-issue list (`[{ message, path }]`)
  // in ORPCError.data — fold it into the message here, once, so every
  // consumer (toasts, error views, logs) names the failing field.
  interceptors: [
    async (options) => {
      try {
        return await options.next()
      } catch (error) {
        enrichApiErrorMessage(error)
        throw error
      }
    },
  ],
})

export const orpc: RouterClient<ApiRouter> = createORPCClient(link)

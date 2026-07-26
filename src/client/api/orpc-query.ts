import { createORPCReactQueryUtils } from '@orpc/react-query'

import { orpc } from '@/client/api/client'

/**
 * Typed oRPC + TanStack Query integration. Every procedure under
 * `apiRouter` exposes queryOptions, infiniteOptions, mutationOptions,
 * and key() for cache invalidation.
 */
export const orpcQuery = createORPCReactQueryUtils(orpc)

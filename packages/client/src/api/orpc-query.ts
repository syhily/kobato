import { orpc } from '@kobato/client/api/client'
import { createORPCReactQueryUtils } from '@orpc/react-query'

/**
 * Typed oRPC + TanStack Query integration. Every procedure under
 * `apiRouter` exposes queryOptions, infiniteOptions, mutationOptions,
 * and key() for cache invalidation.
 */
export const orpcQuery = createORPCReactQueryUtils(orpc)

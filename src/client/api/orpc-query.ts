import { createORPCReactQueryUtils } from '@orpc/react-query'

import { orpc } from '@/client/api/client'

/**
 * Typed oRPC + TanStack Query integration: every procedure exposes
 * queryOptions / infiniteOptions / mutationOptions / key().
 */
export const orpcQuery = createORPCReactQueryUtils(orpc)

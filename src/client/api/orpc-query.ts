import { createORPCReactQueryUtils } from '@orpc/react-query'

import { orpc } from '@/client/api/client'

/**
 * Typed oRPC + TanStack Query integration.
 *
 * Every procedure under `apiRouter` exposes:
 *   - `orpcQuery.xxx.yyy.queryOptions({ input })`  → useQuery / useSuspenseQuery
 *   - `orpcQuery.xxx.yyy.infiniteOptions({ input: (pageParam) => …, initialPageParam })`
 *                                                  → useInfiniteQuery
 *   - `orpcQuery.xxx.yyy.mutationOptions()`        → useMutation
 *   - `orpcQuery.xxx.yyy.key({ input })`           → QueryKey for prefetch / invalidate
 *   - `orpcQuery.xxx.key()` / `orpcQuery.xxx.yyy.key()` → partial-matching scope:
 *     router level fans out to a whole namespace, procedure level to one
 *     procedure's inputs and operation types (`@orpc/tanstack-query@1.14.8`
 *     has no `.matcher()` — `.key()` is the scope interface).
 *
 * Example:
 *   const { data } = useQuery(orpcQuery.admin.posts.list.queryOptions({ input: { offset: 0 } }))
 *   const mutation = useMutation(orpcQuery.admin.posts.delete.mutationOptions())
 */
export const orpcQuery = createORPCReactQueryUtils(orpc)

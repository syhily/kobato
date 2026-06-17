import { startRouteWarmup } from '@/client/scripts/route-warmup'
import { CHUNKS_SENTINEL } from '@/shared/constants/route-warmup'

// This file is the bundle entry for the inline route-warmup script
// (`routeWarmupPlugin`). The sentinel below is replaced by `RouteWarmupScript`
// (SSR, per request) with the chunk-list JSON array before the inline
// `<script>` runs, keeping the bundled output fully static and minifiable
// while still varying chunks per request/role. The cast documents that the
// argument is a placeholder, not a real array, at this layer.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- build-time placeholder; SSR rewrites the argument before the script runs
startRouteWarmup(CHUNKS_SENTINEL as unknown as string[])

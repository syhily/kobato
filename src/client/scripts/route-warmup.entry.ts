import { startRouteWarmup } from '@/client/scripts/route-warmup'
import { CHUNKS_SENTINEL } from '@/shared/constants/route-warmup'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// This file is the bundle entry for the inline route-warmup script
// (`routeWarmupPlugin`). The sentinel below is replaced by `RouteWarmupScript`
// (SSR, per request) with the chunk-list JSON array before the inline
// `<script>` runs, keeping the bundled output fully static and minifiable
// while still varying chunks per request/role. The cast documents that the
// argument is a placeholder, not a real array, at this layer.
startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

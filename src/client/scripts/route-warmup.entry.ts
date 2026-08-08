import { startRouteWarmup } from '@/client/scripts/route-warmup'
import { CHUNKS_SENTINEL } from '@/shared/constants/route-warmup'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Bundle entry for the inline route-warmup script; `RouteWarmupScript`
// replaces the sentinel below per request with the chunk list.
startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

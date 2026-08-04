import { startRouteWarmup } from '@kobato/client/scripts/route-warmup'
import { CHUNKS_SENTINEL } from '@kobato/shared/constants/route-warmup'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// Bundle entry for the inline route-warmup script. The sentinel below is
// replaced by `RouteWarmupScript` (SSR, per request) with the chunk list.
startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

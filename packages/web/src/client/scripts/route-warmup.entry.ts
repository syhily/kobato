import { CHUNKS_SENTINEL } from '@kobato/shared/constants/route-warmup.ts'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'
import { startRouteWarmup } from '@kobato/web/client/scripts/route-warmup.ts'

// Bundle entry for the inline route-warmup script; `RouteWarmupScript`
// replaces the sentinel below per request with the chunk list.
startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

import { CHUNKS_SENTINEL } from '@kobato/distribution/route-warmup'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { startRouteWarmup } from '@kobato/web-client/route-warmup/idle-script'

startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

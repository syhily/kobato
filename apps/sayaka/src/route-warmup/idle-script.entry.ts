import { CHUNKS_SENTINEL } from '@kobato/base/distribution/route-warmup'
import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { startRouteWarmup } from '@sayaka/route-warmup/idle-script'

startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

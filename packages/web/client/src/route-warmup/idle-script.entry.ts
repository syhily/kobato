import { CHUNKS_SENTINEL } from '@kobato/distribution/route-warmup.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { startRouteWarmup } from '@kobato/web-client/route-warmup/idle-script.ts'

startRouteWarmup(unsafeCast<string[]>(CHUNKS_SENTINEL))

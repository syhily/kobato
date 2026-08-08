// Imported for its side effect BEFORE the server graph in the SEA entry,
// so natives extraction + `KOBATO_NATIVES_DIR` land before sharp /
// @napi-rs/canvas run their module-scope platform detection.

import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'

bootstrapSeaRuntime()

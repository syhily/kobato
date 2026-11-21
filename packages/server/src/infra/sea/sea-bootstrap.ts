// Imported for its side effect BEFORE the server graph in the SEA entry,
// so natives extraction + `KOBATO_NATIVES_DIR` land before sharp /
// @napi-rs/canvas run their module-scope platform detection.

import { bootstrapSeaRuntime } from '@kobato/server/infra/sea/sea-natives'
import { installSeaVfsRuntimePatches } from '@kobato/server/infra/sea/sea-vfs-fs-patch'

installSeaVfsRuntimePatches()
bootstrapSeaRuntime()

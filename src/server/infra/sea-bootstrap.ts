// Imported for its side effect BEFORE the server graph in the SEA entry,
// so natives extraction + `KOBATO_NATIVES_DIR` land before sharp /
// @napi-rs/canvas run their module-scope platform detection.

import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'
import { installSeaVfsRuntimePatches } from '@/server/infra/sea-vfs-fs-patch'

// The writev/readv repair lands before anything in the server graph can
// create a WriteStream — WriteStream resolves fs.writev per call, so
// patching this early covers every later user.
installSeaVfsRuntimePatches()
bootstrapSeaRuntime()

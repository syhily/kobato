// Imported for its side effect BEFORE the server graph in the SEA entry,
// so natives extraction + `KOBATO_NATIVES_DIR` land before sharp /
// @napi-rs/canvas run their module-scope platform detection.

import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'
import { installSeaVfsRuntimePatches } from '@/server/infra/sea-vfs-fs-patch'

// The writev/readv + dlopen repairs land before anything in the server graph
// can create a WriteStream or load a native addon — WriteStream resolves
// fs.writev per call and the CJS `.node` handler resolves process.dlopen per
// load, so patching this early covers every later user.
installSeaVfsRuntimePatches()
bootstrapSeaRuntime()

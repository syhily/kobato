import { bootstrapSeaRuntime } from '@kobato/server/infra/sea/sea-natives'
import { installSeaVfsRuntimePatches } from '@kobato/server/infra/sea/sea-vfs-fs-patch'

installSeaVfsRuntimePatches()
bootstrapSeaRuntime()

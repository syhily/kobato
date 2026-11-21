import { seaAssetPath } from '@kobato/server/infra/sea/sea'
import { existsSync, readFileSync } from 'node:fs'

export function readAssetTextOrDisk(key: string, diskPath: string): string | null {
  const assetPath = seaAssetPath(key)
  const path = assetPath ?? diskPath
  if (!existsSync(path)) {
    return null
  }
  return readFileSync(path, 'utf-8')
}

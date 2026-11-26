import { getLogger } from '@kobato/server/infra/logger'
import { nodeStreamToWeb } from '@kobato/server/infra/node-streams'
import { resolveLocalPath } from '@kobato/server/infra/storage/backends/local'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

export interface StoredLocalObject {
  absPath: string
  size: number
  etag: string
}

export type StoredLocalObjectLookup = StoredLocalObject | 'invalid-path' | 'missing'

export async function lookupStoredLocalObject(
  key: string,
  logScope: string,
  logTarget: string,
): Promise<StoredLocalObjectLookup> {
  let absPath: string
  try {
    absPath = resolveLocalPath(key)
  } catch {
    return 'invalid-path'
  }
  try {
    const file = await stat(absPath)
    if (!file.isFile()) {
      return 'missing'
    }
    return {
      absPath,
      size: file.size,
      etag: `"${file.size}-${Math.floor(file.mtimeMs)}"`,
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return 'missing'
    }
    getLogger(logScope).warn('Failed to stat stored file', {
      target: logTarget,
      key,
      error: String(error),
    })
    throw error
  }
}

export function openStoredLocalObject(absPath: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  return nodeStreamToWeb(createReadStream(absPath, start === undefined ? undefined : { start, end }))
}

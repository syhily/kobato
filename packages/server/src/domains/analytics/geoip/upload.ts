import { resetGeoReader } from '@kobato/server/domains/analytics/geoip/lookup'
import { withGeoipWriteLock, writeGeoipMetaBestEffort } from '@kobato/server/domains/analytics/geoip/update'
import { MAXMIND_DB_PATH } from '@kobato/server/infra/data-paths'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { Reader } from '@maxmind/geoip2-node'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function uploadGeoipDatabase(file: File): Promise<{ size: number }> {
  if (!file.name.toLowerCase().endsWith('.mmdb')) {
    throw new ActionFailure(400, descriptorFor('maxmind.error.wrongFormat'))
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) {
    throw new ActionFailure(400, descriptorFor('common.error.uploadEmpty'))
  }

  const installed = await withGeoipWriteLock(async () => {
    await mkdir(path.dirname(MAXMIND_DB_PATH), { recursive: true })
    const temporaryPath = `${MAXMIND_DB_PATH}.upload`
    await writeFile(temporaryPath, buffer)
    try {
      await Reader.open(temporaryPath)
    } catch {
      await unlink(temporaryPath).catch(() => undefined)
      return false
    }
    await rename(temporaryPath, MAXMIND_DB_PATH)
    resetGeoReader()
    await writeGeoipMetaBestEffort({ version: null, source: 'upload', updatedAt: new Date().toISOString() })
    return true
  })
  if (!installed) {
    throw new ActionFailure(400, descriptorFor('maxmind.error.invalidDb'))
  }
  return { size: buffer.length }
}

import type { StorageBackend } from '@kobato/server/infra/storage/backend'
import type { StorageDriver } from '@kobato/settings/types'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { localBackend } from '@kobato/server/infra/storage/backends/local'
import { s3Backend } from '@kobato/server/infra/storage/backends/s3'

const backends: Record<StorageDriver, StorageBackend> = {
  s3: s3Backend,
  local: localBackend,
}

export function backendFor(driver: StorageDriver): StorageBackend {
  return backends[driver]
}

export function activeBackend(): { backend: StorageBackend; driver: StorageDriver } {
  try {
    if (backends.s3.isAvailable()) {
      return { backend: backends.s3, driver: 's3' }
    }
  } catch {}
  return { backend: backends.local, driver: 'local' }
}

export function allBackends(): { driver: StorageDriver; backend: StorageBackend }[] {
  return Object.entries(backends).map(([driver, backend]) => ({
    driver: unsafeCast<StorageDriver>(driver),
    backend,
  }))
}

export function isS3Primary(): boolean {
  return activeBackend().driver === 's3'
}

export function __setStorageBackendForTests(driver: StorageDriver, backend: StorageBackend): void {
  backends[driver] = backend
}

export function __resetStorageBackendsForTests(): void {
  backends.s3 = s3Backend
  backends.local = localBackend
}

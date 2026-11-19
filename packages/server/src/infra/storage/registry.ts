import type { StorageBackend } from '@kobato/server/infra/storage/backend.ts'
import type { StorageDriver } from '@kobato/settings/types.ts'

import { localBackend } from '@kobato/server/infra/storage/backends/local.ts'
import { s3Backend } from '@kobato/server/infra/storage/backends/s3.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

const backends: Record<StorageDriver, StorageBackend> = {
  s3: s3Backend,
  local: localBackend,
}

export function backendFor(driver: StorageDriver): StorageBackend {
  return backends[driver]
}

/** Backend for new uploads: S3 when enabled and fully configured, local otherwise
 *  (the always-on fallback). */
export function activeBackend(): { backend: StorageBackend; driver: StorageDriver } {
  try {
    // Via the registry (not the import) so the test seam can substitute a backend.
    if (backends.s3.isAvailable()) {
      return { backend: backends.s3, driver: 's3' }
    }
  } catch {
    // Settings snapshot not hydrated yet (early boot, install gate) — fall back to local.
  }
  return { backend: backends.local, driver: 'local' }
}

/** Every registered backend in stable order (s3 first), for operations spanning all
 *  backends (backup reconcile); on key collisions the earlier driver wins. */
export function allBackends(): { driver: StorageDriver; backend: StorageBackend }[] {
  // `Object.entries` widens keys to `string`; they are `StorageDriver` by construction.
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

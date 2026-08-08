import type { StorageBackend } from '@/server/infra/storage/backend'
import type { StorageDriver } from '@/shared/config/types'

import { localBackend } from '@/server/infra/storage/backends/local'
import { s3Backend } from '@/server/infra/storage/backends/s3'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const backends: Record<StorageDriver, StorageBackend> = {
  s3: s3Backend,
  local: localBackend,
}

/**
 * Resolve the backend an existing asset lives in (for reads, deletes, and
 * migration). Driver values come from each asset's `storage_driver` /
 * `BrandingObjectRef.driver` field.
 */
export function backendFor(driver: StorageDriver): StorageBackend {
  return backends[driver]
}

/**
 * Backend for new uploads: S3 when enabled and fully configured, local otherwise
 * (the always-on fallback).
 */
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

/**
 * Every registered backend in stable order (s3 first), for operations spanning
 * all backends (backup reconcile). On key collisions the earlier driver wins.
 */
export function allBackends(): { driver: StorageDriver; backend: StorageBackend }[] {
  // `Object.entries` widens keys to `string`; they are `StorageDriver` by construction.
  return Object.entries(backends).map(([driver, backend]) => ({
    driver: unsafeCast<StorageDriver>(driver),
    backend,
  }))
}

/** True when S3 is configured as the primary backend for new uploads. */
export function isS3Primary(): boolean {
  return activeBackend().driver === 's3'
}

/** Test seam: substitute a driver's backend. Pair with `__resetStorageBackendsForTests` in afterEach. */
export function __setStorageBackendForTests(driver: StorageDriver, backend: StorageBackend): void {
  backends[driver] = backend
}

/** Test seam: restore the real backends registered at module load. */
export function __resetStorageBackendsForTests(): void {
  backends.s3 = s3Backend
  backends.local = localBackend
}

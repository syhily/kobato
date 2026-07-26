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
 * The backend new uploads go to: S3 when it is enabled AND fully configured
 * (endpoint + bucket + keys), local otherwise. Local is the always-on
 * fallback, so uploads never hard-fail on a missing/misconfigured S3.
 *
 * Wrapped in try/catch so a not-yet-hydrated settings snapshot (early boot,
 * install gate) degrades to local instead of throwing.
 */
export function activeBackend(): { backend: StorageBackend; driver: StorageDriver } {
  try {
    if (s3Backend.isAvailable()) {
      return { backend: s3Backend, driver: 's3' }
    }
  } catch {
    // Settings snapshot not hydrated yet — fall back to local.
  }
  return { backend: localBackend, driver: 'local' }
}

/**
 * Every registered backend in stable registry order (s3 first, then
 * local), for operations that span all backends at once — e.g. the backup
 * reconcile, which lists each backend to re-register orphaned objects.
 * When the same key exists in several backends, the earlier driver wins.
 */
export function allBackends(): { driver: StorageDriver; backend: StorageBackend }[] {
  // `Object.entries` widens the record keys to `string`; they are
  // `StorageDriver` by construction.
  return Object.entries(backends).map(([driver, backend]) => ({
    driver: unsafeCast<StorageDriver>(driver),
    backend,
  }))
}

/** True when S3 is configured as the primary backend for new uploads. */
export function isS3Primary(): boolean {
  return activeBackend().driver === 's3'
}

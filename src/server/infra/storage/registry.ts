import type { StorageBackend, StorageDriver } from '@/server/infra/storage/backend'

import { localBackend } from '@/server/infra/storage/backends/local'
import { s3Backend } from '@/server/infra/storage/backends/s3'

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

/** True when S3 is configured as the primary backend for new uploads. */
export function isS3Primary(): boolean {
  return activeBackend().driver === 's3'
}

export type { StorageDriver, StorageBackend } from '@/server/infra/storage/backend'

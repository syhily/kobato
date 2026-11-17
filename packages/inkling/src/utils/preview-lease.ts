/**
 * The owned lifetime of a blob object URL used as an in-editor preview: the one file that
 * calls `URL.createObjectURL` / `URL.revokeObjectURL`, pinned by
 * `tests/inkling/unit/utils/upload-preview-imports.test.ts`. A lease pairs creation with an
 * idempotent release; several concurrent previews hold a `PreviewLeasePool`.
 */

/** Releases a preview object URL; the `blob:` guard keeps real URLs untouched. */
function revokePreviewUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export interface PreviewLease {
  /** The object URL handed out for preview/metadata use. */
  url: string
  /** Revokes the object URL. Idempotent — safe to call more than once. */
  release: () => void
}

/** Pairs object-URL creation with an idempotent release built on `revokePreviewUrl`'s `blob:` guard. */
export function createPreviewLease(blob: Blob): PreviewLease {
  const url = URL.createObjectURL(blob)
  let released = false
  return {
    url,
    release: () => {
      if (!released) {
        released = true
        revokePreviewUrl(url)
      }
    },
  }
}

export interface PreviewLeasePool {
  /** Leases a preview URL for a blob and tracks it. Returns the URL. */
  lease: (blob: Blob) => string
  /** Releases one tracked URL; a no-op for unknown or already-released URLs. */
  release: (url: string | null | undefined) => void
  /** Releases every tracked URL (the unmount cleanup). */
  releaseAll: () => void
}

/**
 * Tracks a set of preview leases (gallery's multi-file previews) so each can be released
 * individually and all of them at once on unmount.
 */
export function createPreviewLeasePool(): PreviewLeasePool {
  const leases = new Map<string, PreviewLease>()
  return {
    lease: (blob) => {
      const lease = createPreviewLease(blob)
      leases.set(lease.url, lease)
      return lease.url
    },
    release: (url) => {
      if (url) {
        leases.get(url)?.release()
        leases.delete(url)
      }
    },
    releaseAll: () => {
      leases.forEach((lease) => lease.release())
      leases.clear()
    },
  }
}

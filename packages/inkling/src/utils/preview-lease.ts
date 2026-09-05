/**
 * The preview lease module: the owned lifetime of a blob object URL used as
 * an in-editor preview (CONTEXT.md "Preview lease"). This is the one file
 * that calls `URL.createObjectURL` / `URL.revokeObjectURL` — an import guard
 * (test/unit/utils/upload-preview-imports.test.ts) keeps it that way. A
 * lease pairs creation with an idempotent release; callers that outlive a
 * single intent (video's thumbnail preview) hold the lease through
 * `usePreviewLease`; callers with several concurrent previews (gallery) hold
 * a `PreviewLeasePool`. The upload-intent module is a consumer: it leases a
 * preview per upload and releases it when the intent settles.
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

/**
 * The one place `URL.createObjectURL` is called for upload previews: a lease
 * pairs creation with an idempotent release built on `revokePreviewUrl`'s
 * `blob:` guard.
 */
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
 * Tracks a set of preview leases (gallery's multi-file previews) so each can
 * be released individually — on success, failure, or delete — and all of them
 * at once on unmount.
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

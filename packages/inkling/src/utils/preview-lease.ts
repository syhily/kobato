function revokePreviewUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export interface PreviewLease {
  url: string
  release: () => void
}

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
  lease: (blob: Blob) => string
  release: (url: string | null | undefined) => void
  releaseAll: () => void
}

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

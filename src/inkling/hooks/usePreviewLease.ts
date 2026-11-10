import React from 'react'

import { createPreviewLease, type PreviewLease } from '@/inkling/utils/preview-lease'

/**
 * Bridges the preview lease to React state: the state holds the current preview
 * URL, replacing or clearing it releases the previous lease, and unmounting
 * releases whatever is still held.
 */
export function usePreviewLease(): [string, (blob: Blob | null) => void] {
  const [previewUrl, setPreviewUrl] = React.useState('')
  const leaseRef = React.useRef<PreviewLease | null>(null)

  const setPreview = React.useCallback((blob: Blob | null) => {
    leaseRef.current?.release()
    leaseRef.current = blob ? createPreviewLease(blob) : null
    setPreviewUrl(leaseRef.current?.url ?? '')
  }, [])

  React.useEffect(() => {
    return () => {
      leaseRef.current?.release()
      leaseRef.current = null
    }
  }, [])

  return [previewUrl, setPreview]
}

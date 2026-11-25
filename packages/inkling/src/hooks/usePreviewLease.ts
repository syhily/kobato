import { createPreviewLease, type PreviewLease } from '@kobato/inkling-internal/utils/preview-lease'
import { useCallback, useEffect, useRef, useState } from 'react'
export function usePreviewLease(): [string, (blob: Blob | null) => void] {
  const [previewUrl, setPreviewUrl] = useState('')
  const leaseRef = useRef<PreviewLease | null>(null)
  const setPreview = useCallback((blob: Blob | null) => {
    leaseRef.current?.release()
    leaseRef.current = blob ? createPreviewLease(blob) : null
    setPreviewUrl(leaseRef.current?.url ?? '')
  }, [])

  useEffect(() => {
    return () => {
      leaseRef.current?.release()
      leaseRef.current = null
    }
  }, [])

  return [previewUrl, setPreview]
}

import { useTKHandleState } from '@kobato/inkling-internal/context/TKHandleContext'
import { useEffect } from 'react'
export default function TKCountPlugin({ onChange }: { onChange?: (count: number) => void }) {
  const tkCount = useTKHandleState((state) => state.tkCount)

  useEffect(() => {
    if (!onChange) {
      return
    }

    onChange(tkCount)
  }, [onChange, tkCount])

  return null
}

import React from 'react'

import { useTKHandleState } from '@/context/TKHandleContext'

export default function TKCountPlugin({ onChange }: { onChange?: (count: number) => void }) {
  const tkCount = useTKHandleState((state) => state.tkCount)

  React.useEffect(() => {
    if (!onChange) {
      return
    }

    onChange(tkCount)
  }, [onChange, tkCount])

  return null
}

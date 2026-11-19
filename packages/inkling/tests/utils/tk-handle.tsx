import { TKHandleContext } from '@kobato/inkling-internal/context/TKHandleContext'
import { createTKHandle, type TKHandle } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'
import React from 'react'

export function createTKHandleWrapper(handle: TKHandle = createTKHandle()) {
  function TKHandleWrapper({ children }: { children: React.ReactNode }) {
    return <TKHandleContext.Provider value={handle}>{children}</TKHandleContext.Provider>
  }
  return { handle, wrapper: TKHandleWrapper }
}

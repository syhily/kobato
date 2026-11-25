import type { ReactNode } from 'react'

import { TKHandleContext } from '@kobato/inkling-internal/context/TKHandleContext'
import { createTKHandle, type TKHandle } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'
export function createTKHandleWrapper(handle: TKHandle = createTKHandle()) {
  function TKHandleWrapper({ children }: { children: ReactNode }) {
    return <TKHandleContext.Provider value={handle}>{children}</TKHandleContext.Provider>
  }
  return { handle, wrapper: TKHandleWrapper }
}

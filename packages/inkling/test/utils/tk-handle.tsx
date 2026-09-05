import React from 'react'

import { TKHandleContext } from '@/context/TKHandleContext'
import { createTKHandle, type TKHandle } from '@/plugins/behaviour/tkHandle'

// Test stand-in for the per-composer provider InklingComposer mounts: wraps
// children in a TKHandleContext.Provider backed by a real handle. Returns the
// handle alongside the wrapper so tests can seed or inspect state.
export function createTKHandleWrapper(handle: TKHandle = createTKHandle()) {
  function TKHandleWrapper({ children }: { children: React.ReactNode }) {
    return <TKHandleContext.Provider value={handle}>{children}</TKHandleContext.Provider>
  }
  return { handle, wrapper: TKHandleWrapper }
}

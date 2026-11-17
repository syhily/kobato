import React from 'react'

import FloatingButton from './FloatingButton'
import Sidebar from './Sidebar'
import Watermark from './Watermark'

export function useDemoSidebar() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false)
  const [sidebarView, setSidebarView] = React.useState<'json' | 'tree'>('json')

  const openSidebar = React.useCallback(
    (view: 'json' | 'tree' = 'json') => {
      if (isSidebarOpen && sidebarView === view) {
        setIsSidebarOpen(false)
        return
      }
      setSidebarView(view)
      setIsSidebarOpen(true)
    },
    [isSidebarOpen, sidebarView],
  )

  return { isSidebarOpen, sidebarView, openSidebar }
}

/**
 * Each surface passes its own `useDemoSidebar()` state, since it may read `isSidebarOpen` for layout adjustments.
 */
export function DemoChrome({
  sidebar,
  saveContent,
  editorType,
}: {
  sidebar: ReturnType<typeof useDemoSidebar>
  saveContent?: () => void
  editorType?: string
}) {
  return (
    <>
      <Watermark editorType={editorType} />
      <div className="absolute z-20 flex h-full flex-col items-end sm:relative">
        <Sidebar isOpen={sidebar.isSidebarOpen} saveContent={saveContent} view={sidebar.sidebarView} />
        <FloatingButton isOpen={sidebar.isSidebarOpen} onClick={sidebar.openSidebar} />
      </div>
    </>
  )
}

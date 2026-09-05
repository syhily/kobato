import React from 'react'

import FloatingButton from './FloatingButton'
import Sidebar from './Sidebar'
import Watermark from './Watermark'

/**
 * The demo sidebar state (open/closed, json/tree view) — previously
 * hand-typed in all three demos beside identical `openSidebar` bodies.
 */
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
 * The shared demo chrome: the watermark plus the right-edge sidebar and its
 * floating toggle. Each demo passes its own `useDemoSidebar()` state (it may
 * read `isSidebarOpen` for layout adjustments, as DemoApp does).
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

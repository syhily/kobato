import FloatingButton from '@kobato/inkling-demo/components/FloatingButton'
import Sidebar from '@kobato/inkling-demo/components/Sidebar'
import Watermark from '@kobato/inkling-demo/components/Watermark'
import { useCallback, useState } from 'react'
export function useDemoSidebar() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [sidebarView, setSidebarView] = useState<'json' | 'tree'>('json')

  const openSidebar = useCallback(
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

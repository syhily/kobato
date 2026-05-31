import { XIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

export function SettingsCloseButton() {
  const navigate = useNavigate()

  return (
    <div className="fixed top-2 right-0 z-50 m-8 hidden justify-end lg:flex">
      <button
        type="button"
        title="关闭 (ESC)"
        onClick={() => {
          void navigate(-1)
        }}
        className="inline-flex items-center rounded-xl p-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-hidden"
      >
        <XIcon className="size-6" aria-hidden="true" />
        <span className="sr-only">关闭</span>
      </button>
    </div>
  )
}

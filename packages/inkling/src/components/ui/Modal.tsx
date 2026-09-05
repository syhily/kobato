import CloseIcon from '@/assets/icons/inkling-close.svg?react'
import Portal from '@/components/ui/Portal'
import { useInklingLabels } from '@/hooks/useInklingLabels'

export function Modal({
  isOpen,
  onClose,
  children,
}: {
  isOpen?: boolean
  onClose: () => void
  children?: React.ReactNode
}) {
  const labels = useInklingLabels()

  const controlByKeys = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      onClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <Portal>
      <div
        className="fixed top-0 left-0 z-40 flex size-full items-start justify-center overflow-auto"
        role="dialog"
        aria-modal
        onKeyDown={controlByKeys}
      >
        <div className="fixed inset-0 z-40 h-[100vh] bg-black opacity-60" onClick={onClose}></div>
        <div className="relative z-50 my-8 w-full max-w-[550px] rounded-lg bg-white drop-shadow-2xl dark:bg-black">
          <button
            aria-label={labels['aria.closeDialog']}
            className="absolute top-6 right-6 cursor-pointer"
            type="button"
            autoFocus
            onClick={onClose}
          >
            <CloseIcon className="size-4 stroke-2 text-grey-400" />
          </button>
          {children}
        </div>
      </div>
    </Portal>
  )
}

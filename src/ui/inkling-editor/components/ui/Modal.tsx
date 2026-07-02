import CloseIcon from '@/ui/inkling-editor/assets/icons/inkling-close.svg?react'
import Portal from '@/ui/inkling-editor/components/ui/Portal'

export function Modal({
  isOpen,
  onClose,
  children,
}: {
  isOpen?: boolean
  onClose: () => void
  children?: React.ReactNode
}) {
  const controlByKeys = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    event.preventDefault()

    if (event.key === 'Escape') {
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
          <button aria-label="Close dialog" className="absolute top-6 right-6 cursor-pointer" type="button" autoFocus>
            <CloseIcon className="size-4 stroke-2 text-grey-400" onClick={onClose} />
          </button>
          {children}
        </div>
      </div>
    </Portal>
  )
}

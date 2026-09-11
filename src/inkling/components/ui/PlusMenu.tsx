import PlusIcon from '@/inkling/assets/icons/plus.svg?react'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'

export function PlusButton({ onClick }: { onClick?: () => void }) {
  const labels = useInklingLabels()

  return (
    <div className="xs:left-[-66px] absolute top-[-2px] left-[-32px]" data-inkling-plus-button>
      <button
        aria-label={labels['aria.addCard']}
        className="group border-grey hover:border-grey-800 dark:border-grey-800 dark:hover:border-grey-400 relative flex size-7 cursor-pointer items-center justify-center rounded-full border transition-all ease-linear md:size-9"
        type="button"
        onClick={onClick}
      >
        <PlusIcon className="stroke-grey-800 dark:stroke-grey-300 size-4 stroke-2" />
      </button>
    </div>
  )
}

export function PlusMenu({ children }: { children?: React.ReactNode }) {
  return (
    <div className="absolute left-[-16px]" data-inkling-plus-menu>
      {children}
    </div>
  )
}

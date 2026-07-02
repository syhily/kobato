import PlusIcon from '@/ui/inkling-editor/assets/icons/plus.svg?react'

export function PlusButton({ onClick }: { onClick?: () => void }) {
  return (
    <div className="xs:left-[-66px] absolute top-[-2px] left-[-32px]" data-inkling-plus-button>
      <button
        aria-label="Add a card"
        className="group relative flex size-7 cursor-pointer items-center justify-center rounded-full border border-grey transition-all ease-linear hover:border-grey-800 md:size-9 dark:border-grey-800 dark:hover:border-grey-400"
        type="button"
        onClick={onClick}
      >
        <PlusIcon className="size-4 stroke-grey-800 stroke-2 dark:stroke-grey-300" />
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

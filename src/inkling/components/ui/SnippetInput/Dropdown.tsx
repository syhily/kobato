import ReplaceIcon from '@/inkling/assets/icons/inkling-sync.svg?react'
import PlusIcon from '@/inkling/assets/icons/plus.svg?react'
import { type SnippetItem } from '@/inkling/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'
import { interpolateLabel } from '@/inkling/labels/inkling-labels'

export const Dropdown = ({
  snippets,
  onCreateSnippet,
  onUpdateSnippet,
  value,
  isCreateButtonActive,
  activeMenuItem,
}: {
  snippets: SnippetItem[]
  onCreateSnippet?: () => void
  onUpdateSnippet?: (name: string) => void
  value?: string
  isCreateButtonActive?: boolean
  activeMenuItem?: number
}) => {
  const labels = useInklingLabels()

  return (
    <ul
      className="border-grey-200 dark:border-grey-900 dark:bg-grey-950 absolute mt-[-1px] w-full max-w-[240px] rounded-b border bg-white shadow-md"
      tabIndex={0}
    >
      <li className="mb-0 block">
        <button
          className={`hover:bg-grey-100 flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm font-medium text-green-600 dark:hover:bg-black ${isCreateButtonActive ? 'bg-grey-100 dark:bg-black' : ''}`}
          type="button"
          onClick={onCreateSnippet}
        >
          <span>{interpolateLabel(labels['snippet.create'], { name: value ?? '' })}</span>
          <PlusIcon className="size-3 stroke-green-600 stroke-[3px]" />
        </button>
      </li>

      {!!snippets.length && (
        <DropdownSection activeMenuItem={activeMenuItem} list={snippets} onClick={onUpdateSnippet} />
      )}
    </ul>
  )
}

const DropdownSection = ({
  list = [],
  onClick,
  activeMenuItem,
}: {
  list?: SnippetItem[]
  onClick?: (name: string) => void
  activeMenuItem?: number
}) => {
  const labels = useInklingLabels()

  return (
    <li role="separator">
      <span className="border-grey-200 text-grey-600 dark:border-grey-900 dark:text-grey-800 block border-t px-3 pt-3 pb-2 text-[1.1rem] font-semibold tracking-wide uppercase">
        {labels['snippet.replaceExisting']}
      </span>
      <ul role="menu">
        {list.map((item: SnippetItem, index: number) => (
          <DropdownItem key={item.name} active={activeMenuItem} index={index} name={item.name} onClick={onClick} />
        ))}
      </ul>
    </li>
  )
}

const DropdownItem = ({
  onClick,
  name,
  active,
  index,
}: {
  onClick?: (name: string) => void
  name: string
  active?: number
  index: number
}) => {
  return (
    <li className="mb-1">
      <button
        className={`hover:bg-grey-100 flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm ${index === active ? 'bg-grey-100 dark:bg-black' : ''} dark:hover:bg-black`}
        type="button"
        onClick={() => onClick?.(name)}
      >
        <span>{name}</span>
        <div className="fill-grey-900 size-5">
          <ReplaceIcon className="fill-grey-900 dark:fill-grey-600 size-4" />
        </div>
      </button>
    </li>
  )
}

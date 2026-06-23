import { Tooltip } from '@/ui/inkling/components/ui/Tooltip'
/** Faithful copy of Koenig's ToolbarMenu.jsx */
import {
  AddIcon,
  BoldIcon,
  EditIcon,
  EyeIcon,
  HeadingThreeIcon,
  HeadingTwoIcon,
  ItalicIcon,
  LinkIcon,
  QuoteIcon,
  QuoteOneIcon,
  QuoteTwoIcon,
  SnippetIcon,
  TrashIcon,
  WandIcon,
} from '@/ui/inkling/icons'

export const TOOLBAR_ICONS = {
  bold: BoldIcon,
  italic: ItalicIcon,
  headingTwo: HeadingTwoIcon,
  headingThree: HeadingThreeIcon,
  quote: QuoteIcon,
  quoteOne: QuoteOneIcon,
  quoteTwo: QuoteTwoIcon,
  link: LinkIcon,
  add: AddIcon,
  edit: EditIcon,
  wand: WandIcon,
  visibility: EyeIcon,
  snippet: SnippetIcon,
  remove: TrashIcon,
}

export type ToolbarIconName = keyof typeof TOOLBAR_ICONS

export function ToolbarMenu({
  children,
  hide,
  ...props
}: { children: React.ReactNode; hide?: boolean } & React.HTMLAttributes<HTMLUListElement>) {
  if (hide) {
    return null
  }

  return (
    <ul
      className="relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white px-1 font-sans text-md font-normal text-black shadow-md dark:bg-grey-950"
      {...props}
    >
      {children}
    </ul>
  )
}

export function ToolbarMenuItem({
  label,
  isActive,
  onClick,
  icon,
  shortcutKeys,
  secondary,
  dataTestId,
  hide,
  ...props
}: {
  label: string
  isActive?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  icon: ToolbarIconName
  shortcutKeys?: string[]
  secondary?: boolean
  dataTestId?: string
  hide?: boolean
} & React.HTMLAttributes<HTMLLIElement>) {
  if (hide) {
    return null
  }

  const Icon = TOOLBAR_ICONS[icon]

  return (
    <li className="group relative m-0 flex p-0 first:m-0" {...props}>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- aria-label is set */}
      <button
        aria-label={label}
        className={`my-1 flex h-8 w-9 cursor-pointer items-center justify-center rounded-md transition hover:bg-grey-200/80 dark:bg-grey-950 dark:hover:bg-grey-900 ${isActive ? 'bg-grey-200/80' : 'bg-white'}`}
        data-kg-active={isActive}
        data-testid={dataTestId}
        type="button"
        onClick={onClick}
      >
        <Icon
          className={`size-4 overflow-visible transition ${secondary ? 'stroke-2' : 'stroke-[2.5]'} ${isActive ? 'text-green-600 dark:text-green-600' : 'text-black dark:text-white'}`}
        />
      </button>
      <Tooltip label={label} shortcutKeys={shortcutKeys} />
    </li>
  )
}

export function ToolbarMenuSeparator({ hide }: { hide?: boolean }) {
  if (hide) {
    return null
  }

  return <li className="m-0 w-px self-stretch bg-grey-300/80 dark:bg-grey-900" />
}

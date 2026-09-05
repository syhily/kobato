import AddIcon from '@/assets/icons/inkling-add.svg?react'
import BoldIcon from '@/assets/icons/inkling-bold.svg?react'
import EditIcon from '@/assets/icons/inkling-edit.svg?react'
import HeadingTwoIcon from '@/assets/icons/inkling-heading-2.svg?react'
import HeadingThreeIcon from '@/assets/icons/inkling-heading-3.svg?react'
import ImgFullIcon from '@/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/assets/icons/inkling-img-wide.svg?react'
import ItalicIcon from '@/assets/icons/inkling-italic.svg?react'
import LinkIcon from '@/assets/icons/inkling-link.svg?react'
import QuoteOneIcon from '@/assets/icons/inkling-quote-1.svg?react'
import QuoteTwoIcon from '@/assets/icons/inkling-quote-2.svg?react'
import QuoteIcon from '@/assets/icons/inkling-quote.svg?react'
import SnippetIcon from '@/assets/icons/inkling-snippet.svg?react'
import { Tooltip } from '@/components/ui/Tooltip'

export const TOOLBAR_ICONS = {
  bold: BoldIcon,
  italic: ItalicIcon,
  headingTwo: HeadingTwoIcon,
  headingThree: HeadingThreeIcon,
  quote: QuoteIcon,
  quoteOne: QuoteOneIcon,
  quoteTwo: QuoteTwoIcon,
  link: LinkIcon,
  imgRegular: ImgRegularIcon,
  imgWide: ImgWideIcon,
  imgFull: ImgFullIcon,
  add: AddIcon,
  edit: EditIcon,
  snippet: SnippetIcon,
} satisfies Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>

export type ToolbarIconName = keyof typeof TOOLBAR_ICONS

export interface ToolbarMenuProps extends React.HTMLAttributes<HTMLUListElement> {
  children?: React.ReactNode
  hide?: boolean
}

export function ToolbarMenu({ children, hide, ...props }: ToolbarMenuProps) {
  if (hide) {
    return null
  }

  return (
    <ul
      className="pointer-events-auto relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white px-1 font-sans text-md font-normal text-black shadow-md dark:bg-grey-950"
      {...props}
    >
      {children}
    </ul>
  )
}

export interface ToolbarMenuItemProps extends React.HTMLAttributes<HTMLLIElement> {
  label: string
  isActive: boolean
  onClick?: (event: React.MouseEvent) => void
  icon: ToolbarIconName
  shortcutKeys?: string | string[]
  secondary?: boolean
  dataTestId?: string
  hide?: boolean
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
}: ToolbarMenuItemProps) {
  if (hide) {
    return null
  }

  const Icon = TOOLBAR_ICONS[icon]

  return (
    <li className="group relative m-0 flex p-0 first:m-0" {...props}>
      <button
        aria-label={label}
        className={`my-1 flex h-8 w-9 cursor-pointer items-center justify-center rounded-md transition hover:bg-grey-200/80 dark:bg-grey-950 dark:hover:bg-grey-900 ${isActive ? 'bg-grey-200/80' : 'bg-white'}`}
        data-inkling-active={isActive}
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

export interface ToolbarMenuSeparatorProps {
  hide?: boolean
}

export function ToolbarMenuSeparator({ hide }: ToolbarMenuSeparatorProps) {
  if (hide) {
    return null
  }

  return <li className="m-0 w-px self-stretch bg-grey-300/80 dark:bg-grey-900"></li>
}

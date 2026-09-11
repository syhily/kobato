import AddIcon from '@/inkling/assets/icons/inkling-add.svg?react'
import AlignCenterIcon from '@/inkling/assets/icons/inkling-align-center.svg?react'
import AlignLeftIcon from '@/inkling/assets/icons/inkling-align-left.svg?react'
import AlignRightIcon from '@/inkling/assets/icons/inkling-align-right.svg?react'
import BoldIcon from '@/inkling/assets/icons/inkling-bold.svg?react'
import EditIcon from '@/inkling/assets/icons/inkling-edit.svg?react'
import HeadingTwoIcon from '@/inkling/assets/icons/inkling-heading-2.svg?react'
import HeadingThreeIcon from '@/inkling/assets/icons/inkling-heading-3.svg?react'
import ImgFullIcon from '@/inkling/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/inkling/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/inkling/assets/icons/inkling-img-wide.svg?react'
import ItalicIcon from '@/inkling/assets/icons/inkling-italic.svg?react'
import LinkIcon from '@/inkling/assets/icons/inkling-link.svg?react'
import QuoteOneIcon from '@/inkling/assets/icons/inkling-quote-1.svg?react'
import QuoteTwoIcon from '@/inkling/assets/icons/inkling-quote-2.svg?react'
import QuoteIcon from '@/inkling/assets/icons/inkling-quote.svg?react'
import SnippetIcon from '@/inkling/assets/icons/inkling-snippet.svg?react'
import { Tooltip } from '@/inkling/components/ui/Tooltip'

export const TOOLBAR_ICONS = {
  bold: BoldIcon,
  italic: ItalicIcon,
  headingTwo: HeadingTwoIcon,
  headingThree: HeadingThreeIcon,
  quote: QuoteIcon,
  quoteOne: QuoteOneIcon,
  quoteTwo: QuoteTwoIcon,
  link: LinkIcon,
  alignLeft: AlignLeftIcon,
  alignCenter: AlignCenterIcon,
  alignRight: AlignRightIcon,
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
      className="dark:bg-grey-950 pointer-events-auto relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white px-1 font-sans text-md font-normal text-black shadow-md"
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
        className={`hover:bg-grey-200/80 dark:bg-grey-950 dark:hover:bg-grey-900 my-1 flex h-8 w-9 cursor-pointer items-center justify-center rounded-md transition ${isActive ? 'bg-grey-200/80' : 'bg-white'}`}
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

  return <li className="bg-grey-300/80 dark:bg-grey-900 m-0 w-px self-stretch"></li>
}

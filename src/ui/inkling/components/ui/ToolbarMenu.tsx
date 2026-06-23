import {
  BoldIcon,
  EditIcon,
  HeadingThreeIcon,
  HeadingTwoIcon,
  ItalicIcon,
  LinkIcon,
  QuoteIcon,
  TrashIcon,
} from '@/ui/inkling/icons'
import { cn } from '@/ui/lib/cn'
import { Tooltip } from '@/ui/inkling/components/ui/Tooltip'

/**
 * Toolbar menu primitives — ported from Koenig's ToolbarMenu.jsx.
 *
 * Three exports:
 *   - ToolbarMenu        — the white capsule container (`<ul>`)
 *   - ToolbarMenuItem    — an icon button with tooltip + active state
 *   - ToolbarMenuSeparator — a 1px vertical divider
 *
 * Visual design (matching Koenig exactly):
 *   - Container: bg-white / dark:bg-grey-950, rounded-lg, shadow-md
 *   - Buttons: h-8 w-9, hover:bg-grey-200/80, active=bg-grey-200/80 + text-green-600
 *   - Icons: size-4, stroke-width 2.5, currentColor
 *   - Divider: 1px wide, full height, bg-grey-300/80
 */

export type ToolbarIconName = 'bold' | 'italic' | 'headingTwo' | 'headingThree' | 'quote' | 'link' | 'edit' | 'trash'

export const TOOLBAR_ICONS: Record<ToolbarIconName, (props: { className?: string }) => React.ReactElement> = {
  bold: BoldIcon,
  italic: ItalicIcon,
  headingTwo: HeadingTwoIcon,
  headingThree: HeadingThreeIcon,
  quote: QuoteIcon,
  link: LinkIcon,
  edit: EditIcon,
  trash: TrashIcon,
}

export function ToolbarMenu({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ul
      className={cn(
        'relative m-0 flex list-none items-center justify-evenly gap-1 rounded-lg bg-white px-1',
        'font-sans text-[1.5rem] font-normal text-black shadow-md',
        'dark:bg-grey-950',
        className,
      )}
    >
      {children}
    </ul>
  )
}

export function ToolbarMenuItem({
  icon,
  label,
  shortcut,
  isActive = false,
  onClick,
  className,
}: {
  icon: ToolbarIconName
  label: string
  shortcut?: string
  isActive?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  className?: string
}) {
  const Icon = TOOLBAR_ICONS[icon]
  return (
    <li className="m-0">
      <div className="group relative inline-block">
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            'my-1 flex h-8 w-9 cursor-pointer items-center justify-center rounded-md transition',
            'bg-white hover:bg-grey-200/80',
            'dark:bg-grey-950 dark:hover:bg-grey-900',
            isActive && 'bg-grey-200/80',
            className,
          )}
        >
          <Icon className={cn('size-4 stroke-[2.5]', isActive ? 'text-green-600' : 'text-black dark:text-white')} />
        </button>
        <Tooltip label={label} shortcut={shortcut} />
      </div>
    </li>
  )
}

export function ToolbarMenuSeparator() {
  return <li className="m-0 w-px self-stretch bg-grey-300/80 dark:bg-grey-900" />
}

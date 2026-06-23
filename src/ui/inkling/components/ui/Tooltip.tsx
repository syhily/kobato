import { cn } from '@/ui/lib/cn'

/**
 * Toolbar tooltip — ported from Koenig's Tooltip.jsx.
 *
 * Shows a label + optional keyboard shortcut chip on hover. Positioned above
 * the parent (which must be `relative` + `group`).
 */
export function Tooltip({
  label,
  shortcut,
  className,
}: {
  label: string
  shortcut?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-1/2 top-[-2rem] -translate-x-1/2',
        'invisible z-[10001] whitespace-nowrap rounded bg-black px-1.5 py-0.5',
        'text-[1.2rem] font-normal text-white opacity-0 transition-opacity duration-100',
        'group-hover:visible group-hover:opacity-100',
        'dark:bg-grey-900',
        className,
      )}
    >
      {label}
      {shortcut !== undefined && shortcut !== '' && (
        <span className="ml-1 rounded bg-grey-900 px-1 dark:bg-grey-950">{shortcut}</span>
      )}
    </span>
  )
}

import type { ComponentProps } from 'react'

import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react'

import { cn } from '@/ui/lib/cn'

// shadcn-style wrapper around Base UI's `Combobox` primitive. The visual
// language mirrors `select.tsx` (same trigger / popup / item shapes) but
// the popup is a *searchable* listbox: a `Combobox.Input` lives inside
// the popup, and Base UI handles substring filtering against the `items`
// prop on `Combobox.Root`.
//
// Use this when a Select would otherwise have many entries and the user
// would benefit from typing to filter. For short, fixed lists prefer
// `select.tsx` so the keyboard interaction stays a plain dropdown.

function Combobox<Value>(props: ComponentProps<typeof BaseCombobox.Root<Value, false>>) {
  return <BaseCombobox.Root data-slot="combobox" {...props} />
}

function ComboboxValue({ ...props }: ComponentProps<typeof BaseCombobox.Value>) {
  return <BaseCombobox.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({
  className,
  size = 'default',
  children,
  ...props
}: ComponentProps<typeof BaseCombobox.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <BaseCombobox.Trigger
      data-slot="combobox-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-line bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring data-[popup-open]:ring-(--ring-width) data-[popup-open]:ring-ring/50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=combobox-value]:line-clamp-1 *:data-[slot=combobox-value]:flex *:data-[slot=combobox-value]:items-center *:data-[slot=combobox-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <BaseCombobox.Icon>
        <ChevronDownIcon className="size-4 opacity-50" />
      </BaseCombobox.Icon>
    </BaseCombobox.Trigger>
  )
}

interface ComboboxContentProps<Item = unknown> extends Omit<ComponentProps<typeof BaseCombobox.Popup>, 'children'> {
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  inputPlaceholder?: string
  emptyMessage?: string
  // Render prop matching `Combobox.List`'s function-child contract: when
  // `Combobox.Root` receives an `items` prop, the list iterates over the
  // *filtered* subset and invokes this for each matching entry. The
  // `Item` generic is best supplied by the caller (e.g. `<ComboboxContent<Page>>`)
  // so the render closure stays type-safe per call site.
  children: (item: Item, index: number) => React.ReactNode
}

function ComboboxContent<Item>({
  className,
  children,
  align = 'start',
  sideOffset,
  inputPlaceholder = '搜索…',
  emptyMessage = '无匹配结果',
  ...props
}: ComboboxContentProps<Item>) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner align={align} sideOffset={sideOffset ?? 4} className="z-(--z-modal)">
        <BaseCombobox.Popup
          data-slot="combobox-content"
          className={cn(
            'relative z-(--z-modal) flex max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <BaseCombobox.Input
              placeholder={inputPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {/*
           * Base UI's `Combobox.Empty` must stay mounted in the DOM
           * regardless of result state — it doubles as an `aria-live`
           * region for AT users (see ComboboxEmpty.js docstring), so we
           * cannot conditionally render it or hide it with `hidden` /
           * `display:none`. To stop it from reserving its `py-6` worth
           * of vertical space when the list has matches, scope the
           * padding/border behind the `empty:` Tailwind variant — the
           * div is genuinely empty whenever Base UI hands it `null`
           * children (i.e. `filteredItems.length > 0`).
           */}
          <BaseCombobox.Empty className="text-center text-sm text-muted-foreground not-empty:px-3 not-empty:py-6">
            {emptyMessage}
          </BaseCombobox.Empty>
          <BaseCombobox.List className="flex max-h-[min(var(--available-height),20rem)] flex-col gap-0.5 overflow-y-auto p-1">
            {children}
          </BaseCombobox.List>
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  )
}

function ComboboxItem({ className, children, ...props }: ComponentProps<typeof BaseCombobox.Item>) {
  return (
    <BaseCombobox.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <BaseCombobox.ItemIndicator>
          <CheckIcon className="size-4" />
        </BaseCombobox.ItemIndicator>
      </span>
    </BaseCombobox.Item>
  )
}

export { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue }

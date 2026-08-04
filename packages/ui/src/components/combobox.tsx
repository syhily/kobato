import type { ComponentProps } from 'react'

import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { transitions } from '@kobato/client/lib/motion'
import { LazyMotionDiv } from '@kobato/ui/components/lazy-motion'
import { cn } from '@kobato/ui/lib/cn'
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react'

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
        "flex w-fit items-center justify-between gap-2 rounded-md border border-line bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring data-[popup-open]:shadow-focus data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=combobox-value]:line-clamp-1 *:data-[slot=combobox-value]:flex *:data-[slot=combobox-value]:items-center *:data-[slot=combobox-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4",
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
            'relative z-(--z-modal) flex max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-popover transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          <LazyMotionDiv
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...transitions.menu, delay: 0.02 }}
            className="contents"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <BaseCombobox.Input
                placeholder={inputPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {/*
             * Base UI's `Combobox.Empty` must stay mounted regardless of
             * result state — it doubles as an `aria-live` region (see
             * ComboboxEmpty.js docstring), so it can't be conditionally
             * rendered or hidden with `display:none`. Instead the padding
             * is scoped behind the `empty:` variant: the div is genuinely
             * empty whenever Base UI hands it `null` children (list has
             * matches).
             */}
            <BaseCombobox.Empty className="text-center text-sm text-muted-foreground not-empty:px-3 not-empty:py-6">
              {emptyMessage}
            </BaseCombobox.Empty>
            <BaseCombobox.List className="flex max-h-[min(var(--available-height),20rem)] flex-col gap-0.5 overflow-y-auto p-1">
              {children}
            </BaseCombobox.List>
          </LazyMotionDiv>
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

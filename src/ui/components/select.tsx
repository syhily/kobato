import type { ComponentProps } from 'react'

import { Select as BaseSelect } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

import { cn } from '@/ui/lib/cn'

function Select<Value>(props: ComponentProps<typeof BaseSelect.Root<Value>>) {
  return <BaseSelect.Root data-slot="select" {...props} />
}

function SelectGroup({ ...props }: ComponentProps<typeof BaseSelect.Group>) {
  return <BaseSelect.Group data-slot="select-group" {...props} />
}

function SelectValue({ ...props }: ComponentProps<typeof BaseSelect.Value>) {
  return <BaseSelect.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: ComponentProps<typeof BaseSelect.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <BaseSelect.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-line bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring data-[popup-open]:ring-(--ring-width) data-[popup-open]:ring-ring/50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <BaseSelect.Icon>
        <ChevronDownIcon className="size-4 opacity-50" />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  )
}

function SelectContent({
  className,
  children,
  align = 'start',
  sideOffset,
  ...props
}: ComponentProps<typeof BaseSelect.Popup> & {
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}) {
  return (
    <BaseSelect.Portal>
      {/*
       * `alignItemWithTrigger={false}` switches Base UI's Select away
       * from its native macOS-style behaviour where the popup overlays
       * the trigger and the selected item lines up over the trigger
       * label. That mode is disorienting in our admin form context —
       * the popup appears to "swallow" the trigger and the chevron
       * disappears under the popup border, which the user reported as
       * "下拉框样式很奇怪". With it disabled the popup behaves like a
       * standard shadcn/Radix popper: anchored below the trigger with
       * a 4px gap, so the trigger and its chevron stay fully visible.
       *
       * `min-w-[var(--anchor-width)]` matches the popup width to the
       * trigger so options never look narrower than their parent
       * combobox column. The CSS variable is exposed by Base UI's
       * positioner.
       */}
      <BaseSelect.Positioner
        align={align}
        side="bottom"
        sideOffset={sideOffset ?? 4}
        alignItemWithTrigger={false}
        className="z-(--z-modal)"
      >
        <BaseSelect.ScrollUpArrow className="flex cursor-default items-center justify-center py-1">
          <ChevronUpIcon className="size-4" />
        </BaseSelect.ScrollUpArrow>
        <BaseSelect.Popup
          data-slot="select-content"
          className={cn(
            'relative z-(--z-modal) max-h-[var(--available-height)] min-w-[max(8rem,var(--anchor-width))] origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          <SelectGroup>{children}</SelectGroup>
        </BaseSelect.Popup>
        <BaseSelect.ScrollDownArrow className="flex cursor-default items-center justify-center py-1">
          <ChevronDownIcon className="size-4" />
        </BaseSelect.ScrollDownArrow>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  )
}

function SelectLabel({ className, ...props }: ComponentProps<typeof BaseSelect.GroupLabel>) {
  return (
    <BaseSelect.GroupLabel
      data-slot="select-label"
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <BaseSelect.ItemIndicator>
          <CheckIcon className="size-4" />
        </BaseSelect.ItemIndicator>
      </span>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  )
}

function SelectSeparator({ className, ...props }: ComponentProps<typeof BaseSelect.Separator>) {
  return (
    <BaseSelect.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue }

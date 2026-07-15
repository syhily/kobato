import type { ComponentProps } from 'react'

import { Tabs as BaseTabs } from '@base-ui/react/tabs'

import { cn } from '@/ui/lib/cn'

function Tabs({
  className,
  value,
  ...props
}: Omit<ComponentProps<typeof BaseTabs.Root>, 'value'> & { value?: string }) {
  return <BaseTabs.Root data-slot="tabs" value={value} className={cn('flex flex-col gap-2', className)} {...props} />
}

function TabsList({ className, ...props }: ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-9 w-fit items-center justify-center gap-1 rounded-lg border bg-muted/60 p-[3px] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  value,
  ...props
}: Omit<ComponentProps<typeof BaseTabs.Tab>, 'value'> & { value?: string }) {
  // Base UI v1.x renamed `data-selected` to `data-active` (mui/base-ui#3024).
  // Keep selectors on `data-[active]:*` so the active state actually highlights.
  return (
    <BaseTabs.Tab
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:border-ring focus-visible:shadow-focus focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:border-border data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  value,
  ...props
}: Omit<ComponentProps<typeof BaseTabs.Panel>, 'value'> & { value?: string }) {
  return (
    <BaseTabs.Panel
      data-slot="tabs-content"
      value={value}
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }

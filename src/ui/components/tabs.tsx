import type { ComponentProps } from 'react'

import { Tabs as BaseTabs } from '@base-ui/react/tabs'

import { cn } from '@/ui/lib/cn'

function Tabs({ className, ...props }: ComponentProps<typeof BaseTabs.Root>) {
  return <BaseTabs.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />
}

function TabsList({ className, ...props }: ComponentProps<typeof BaseTabs.List>) {
  // Render the track as a hairline-bordered surface with explicit gaps
  // between tabs. The default shadcn track uses `bg-muted` (oklch ≈ 0.97)
  // against a white card, which makes it nearly invisible and collapses
  // the three tabs into one shape. A subtle border + per-tab gap makes
  // the segmented control unambiguously read as multiple buttons even
  // when only one is selected.
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

function TabsTrigger({ className, ...props }: ComponentProps<typeof BaseTabs.Tab>) {
  // Selected tab: solid `bg-background` (white) + visible border + shadow
  // so it pops above the track. Unselected tabs stay text-only with a
  // hover affordance, which preserves the segmented-control affordance
  // on light backgrounds where `bg-muted` and `bg-background` are close.
  //
  // ATTRIBUTE NOTE: Base UI v1.x renamed the active-tab attribute from
  // `data-selected` to `data-active` (PR mui/base-ui#3024). Selectors
  // that still target `data-selected` silently match nothing — which
  // looks exactly like "the active state has no styling at all" because
  // the tab keeps its default unselected classes. Keep the variant
  // tokens on `data-[active]:*` so the segmented control actually
  // highlights the chosen tab.
  return (
    <BaseTabs.Tab
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:border-ring focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[active]:border-border data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }

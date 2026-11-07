import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, type ComponentProps } from 'react'
import {
  type ChevronProps,
  type DayButton,
  DayPicker,
  getDefaultClassNames,
  type RootProps,
  type WeekNumberProps,
} from 'react-day-picker'

import { dateFnsLocaleFor, formatDate } from '@/shared/i18n/format'
import { Button, buttonVariants } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export type CalendarProps = ComponentProps<typeof DayPicker> & {
  buttonVariant?: ComponentProps<typeof Button>['variant']
}

function CalendarRoot({ className: rootClassName, rootRef, ...rootProps }: RootProps) {
  return <div data-slot="calendar" ref={rootRef} className={cn(rootClassName)} {...rootProps} />
}

function CalendarChevron({ className: chevronClassName, orientation, ...chevronProps }: ChevronProps) {
  if (orientation === 'left') {
    return <ChevronLeftIcon className={cn('size-4', chevronClassName)} {...chevronProps} />
  }
  if (orientation === 'right') {
    return <ChevronRightIcon className={cn('size-4', chevronClassName)} {...chevronProps} />
  }
  return <ChevronDownIcon className={cn('size-4', chevronClassName)} {...chevronProps} />
}

function CalendarWeekNumber({ children, ...weekProps }: WeekNumberProps) {
  return (
    <td {...weekProps}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
    </td>
  )
}

// DayPicker dates are WALL-CLOCK dates (local components are the truth), so a
// formatter normalizes them onto UTC and formats in UTC — explicit zone, no
// host-zone drift between SSR and hydration.
export function calendarWallClockDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

/** Machine value for `data-day`: always `yyyy-MM-dd`, never a localized date. */
export function calendarMachineDay(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const BASE_COMPONENTS = {
  Root: CalendarRoot,
  Chevron: CalendarChevron,
  DayButton: CalendarDayButton,
  WeekNumber: CalendarWeekNumber,
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  locale: localeProp,
  ...props
}: CalendarProps) {
  const { locale: appLocale } = useI18n()
  const locale = localeProp ?? dateFnsLocaleFor(appLocale)
  const defaultClassNames = useMemo(() => getDefaultClassNames(), [])

  // Month dropdown labels are WALL-CLOCK text: normalized onto UTC and formatted
  // in UTC so SSR and hydration agree regardless of the host/browser zone.
  const mergedFormatters = useMemo(
    () => ({
      formatMonthDropdown: (date: Date) =>
        formatDate(calendarWallClockDate(date), { locale: appLocale, timeZone: 'Etc/UTC', month: 'short' }),
      ...formatters,
    }),
    [appLocale, formatters],
  )

  const mergedClassNames = useMemo(
    () => ({
      root: cn('w-fit', defaultClassNames.root),
      months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
      month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
      nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
      button_previous: cn(
        buttonVariants({ variant: buttonVariant }),
        'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
        defaultClassNames.button_previous,
      ),
      button_next: cn(
        buttonVariants({ variant: buttonVariant }),
        'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
        defaultClassNames.button_next,
      ),
      month_caption: cn(
        'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
        defaultClassNames.month_caption,
      ),
      dropdowns: cn(
        'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
        defaultClassNames.dropdowns,
      ),
      dropdown_root: cn(
        'relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:shadow-focus',
        defaultClassNames.dropdown_root,
      ),
      dropdown: cn('absolute inset-0 opacity-0', defaultClassNames.dropdown),
      caption_label: cn(
        'font-medium select-none',
        captionLayout === 'label'
          ? 'text-sm'
          : 'flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
        defaultClassNames.caption_label,
      ),
      month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
      weekdays: cn('flex', defaultClassNames.weekdays),
      weekday: cn(
        'flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none',
        defaultClassNames.weekday,
      ),
      week: cn('mt-2 flex w-full', defaultClassNames.week),
      week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
      week_number: cn('text-[0.8rem] text-muted-foreground select-none', defaultClassNames.week_number),
      day: cn(
        'group/day relative aspect-square h-full w-full p-0 text-center select-none [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md',
        defaultClassNames.day,
      ),
      range_start: cn('rounded-l-md bg-accent', defaultClassNames.range_start),
      range_middle: cn('rounded-none', defaultClassNames.range_middle),
      range_end: cn('rounded-r-md bg-accent', defaultClassNames.range_end),
      today: cn(
        'rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none',
        defaultClassNames.today,
      ),
      outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaultClassNames.outside),
      disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
      hidden: cn('invisible', defaultClassNames.hidden),
      ...classNames,
    }),
    [captionLayout, buttonVariant, defaultClassNames, classNames],
  )

  const mergedComponents = useMemo(() => ({ ...BASE_COMPONENTS, ...components }), [components])

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-background p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={mergedFormatters}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  )
}

export function CalendarDayButton({ className, day, modifiers, ...props }: ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus()
    }
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={calendarMachineDay(day.date)}
      data-selected-single={
        modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:shadow-focus data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground [&>span]:text-xs [&>span]:opacity-70',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

import type { RateLimitSettings } from '@kobato/shared/config/types'
import type { UseFormReturn } from 'react-hook-form'

import { rateLimitBounds } from '@kobato/shared/config/defaults'
import { BUCKET_META, GROUPS, type BucketKey } from '@kobato/ui/admin/settings/rate-limit/constants'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingsInput } from '@kobato/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@kobato/ui/admin/settings/shell/useSettingsCard'
import { Popover, PopoverContent, PopoverTrigger } from '@kobato/ui/components/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kobato/ui/components/table'
import { cn } from '@kobato/ui/lib/cn'
import { ChevronDownIcon, InfoIcon } from 'lucide-react'
import { Fragment, useState } from 'react'

interface RateLimitFormProps {
  rateLimit: RateLimitSettings
}

function WindowEditCell({
  bucketKey,
  form,
  flushOnBlur,
}: {
  bucketKey: BucketKey
  form: UseFormReturn<RateLimitSettings>
  flushOnBlur: () => void
}) {
  const meta = BUCKET_META[bucketKey]
  const fieldName = `${bucketKey}.windowSeconds` as const
  const currentValue = form.watch(fieldName)
  const matchedOption = meta.quickWindowOptions.find((opt) => opt.seconds === currentValue)
  const [open, setOpen] = useState(false)

  const applyValue = (val: number) => {
    form.setValue(fieldName, val, { shouldDirty: true, shouldValidate: true })
    setOpen(false)
    flushOnBlur()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-7 items-center justify-between gap-1 rounded-md border border-line bg-transparent px-2 text-xs shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:shadow-focus',
        )}
      >
        <span className="min-w-[3ch]">{matchedOption?.label ?? `${currentValue}秒`}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="flex flex-col gap-2">
          <SettingsInput
            flushOnBlur={flushOnBlur}
            type="number"
            min={rateLimitBounds.windowSeconds.min}
            max={rateLimitBounds.windowSeconds.max}
            className="h-7 text-xs"
            value={currentValue}
            onChange={(e) => {
              const val = e.target.value === '' ? rateLimitBounds.windowSeconds.min : Number(e.target.value)
              form.setValue(fieldName, val, { shouldDirty: true, shouldValidate: true })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setOpen(false)
                flushOnBlur()
              }
            }}
          />
          <div className="flex flex-wrap gap-1">
            {meta.quickWindowOptions.map((opt) => (
              <button
                key={opt.seconds}
                type="button"
                className={cn(
                  'rounded-sm px-2 py-1 text-xs transition-colors',
                  opt.seconds === currentValue ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
                onClick={() => applyValue(opt.seconds)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AttemptsEditCell({
  bucketKey,
  form,
  flushOnBlur,
}: {
  bucketKey: BucketKey
  form: UseFormReturn<RateLimitSettings>
  flushOnBlur: () => void
}) {
  const fieldName = `${bucketKey}.maxAttempts` as const
  const currentValue = form.watch(fieldName)
  const error = (form.formState.errors[bucketKey] as { maxAttempts?: { message?: string } } | undefined)?.maxAttempts
    ?.message

  return (
    <SettingsInput
      flushOnBlur={flushOnBlur}
      type="number"
      min={rateLimitBounds.maxAttempts.min}
      max={rateLimitBounds.maxAttempts.max}
      className={cn('h-7 w-16 text-xs', error && 'border-destructive')}
      value={currentValue}
      onChange={(e) => {
        const val = e.target.value === '' ? rateLimitBounds.maxAttempts.min : Number(e.target.value)
        form.setValue(fieldName, val, { shouldDirty: true, shouldValidate: true })
      }}
    />
  )
}

export function ThresholdForm({ rateLimit }: RateLimitFormProps) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<RateLimitSettings, RateLimitSettings>({
    section: 'rateLimit',
    source: rateLimit,
    toState: (source) => source,
    // This card owns the whole section, so its full state IS the honest patch.
    fromState: (state) => ({ ...state }),
  })

  return (
    <SettingGroup
      title="流控设置"
      description="各业务场景的限流策略配置。时间窗口内超过最大尝试次数的请求将被拒绝。"
      {...settingGroupProps}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[140px]">场景</TableHead>
            <TableHead>时间窗口</TableHead>
            <TableHead className="w-24 text-right">最大尝试次数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {GROUPS.map((group) => (
            <Fragment key={group.label}>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={3} className="font-medium text-muted-foreground">
                  {group.label}
                </TableCell>
              </TableRow>
              {group.keys.map((key) => (
                <TableRow key={key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{BUCKET_META[key].title}</span>
                      <Popover>
                        <PopoverTrigger className="inline-flex cursor-help">
                          <InfoIcon className="size-3.5 text-muted-foreground" />
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-max max-w-xs px-3 py-2 text-xs">
                          {BUCKET_META[key].description}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                  <TableCell>
                    <WindowEditCell bucketKey={key} form={form} flushOnBlur={flushOnBlur} />
                  </TableCell>
                  <TableCell className="text-right">
                    <AttemptsEditCell bucketKey={key} form={form} flushOnBlur={flushOnBlur} />
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </SettingGroup>
  )
}

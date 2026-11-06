import { ChevronDownIcon, InfoIcon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { rateLimitBounds, rateLimitDefaults } from '@/shared/config/defaults'
import { rateLimitBucketSchema } from '@/shared/config/rate-limit-bucket'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import {
  ADVANCED_GROUPS,
  ALL_KEYS,
  BUCKET_META,
  COMMON_KEYS,
  type BucketKey,
} from '@/ui/admin/settings/rate-limit/constants'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingsInput } from '@/ui/admin/settings/shell/SettingsInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'
import { cn } from '@/ui/lib/cn'

// Client-side mirror of the server section schema, composed from the same
// shared bucket schema: blur commits validate BEFORE the POST so an
// out-of-range value rolls back with a named reason (red border + toast)
// instead of a bare 400 the user cannot read.
const rateLimitFormSchema = z.object(
  unsafeCast<Record<BucketKey, typeof rateLimitBucketSchema>>(
    Object.fromEntries(Object.keys(BUCKET_META).map((key) => [key, rateLimitBucketSchema])),
  ),
)

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
  // useWatch, not form.watch: render-time watch() results get memoized by the
  // React Compiler (stable form + fieldName deps), freezing the value at its
  // initial state; the hook always re-executes.
  const currentValue = useWatch({ control: form.control, name: fieldName })
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
  const currentValue = useWatch({ control: form.control, name: fieldName })
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

function BucketRow({
  bucketKey,
  form,
  flushOnBlur,
}: {
  bucketKey: BucketKey
  form: UseFormReturn<RateLimitSettings>
  flushOnBlur: () => void
}) {
  const windowSeconds = useWatch({ control: form.control, name: `${bucketKey}.windowSeconds` })
  const maxAttempts = useWatch({ control: form.control, name: `${bucketKey}.maxAttempts` })
  const defaults: RateLimitBucket = rateLimitDefaults[bucketKey]
  const isDefault = windowSeconds === defaults.windowSeconds && maxAttempts === defaults.maxAttempts

  const resetToDefaults = () => {
    form.setValue(`${bucketKey}.windowSeconds`, defaults.windowSeconds, { shouldDirty: true, shouldValidate: true })
    form.setValue(`${bucketKey}.maxAttempts`, defaults.maxAttempts, { shouldDirty: true, shouldValidate: true })
    flushOnBlur()
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{BUCKET_META[bucketKey].title}</span>
          <Popover>
            <PopoverTrigger className="inline-flex cursor-help">
              <InfoIcon className="size-3.5 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent side="top" className="w-max max-w-xs px-3 py-2 text-xs">
              {BUCKET_META[bucketKey].description}
            </PopoverContent>
          </Popover>
        </div>
      </TableCell>
      <TableCell>
        <WindowEditCell bucketKey={bucketKey} form={form} flushOnBlur={flushOnBlur} />
      </TableCell>
      <TableCell className="text-right">
        <AttemptsEditCell bucketKey={bucketKey} form={form} flushOnBlur={flushOnBlur} />
      </TableCell>
      <TableCell className="w-10 text-right">
        <button
          type="button"
          onClick={resetToDefaults}
          disabled={isDefault}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          aria-label={`重置${BUCKET_META[bucketKey].title}为默认值`}
          title="重置为默认值"
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
      </TableCell>
    </TableRow>
  )
}

function BucketTable({
  keys,
  form,
  flushOnBlur,
}: {
  keys: readonly BucketKey[]
  form: UseFormReturn<RateLimitSettings>
  flushOnBlur: () => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[140px]">场景</TableHead>
          <TableHead>时间窗口</TableHead>
          <TableHead className="w-24 text-right">最大尝试次数</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <BucketRow key={key} bucketKey={key} form={form} flushOnBlur={flushOnBlur} />
        ))}
      </TableBody>
    </Table>
  )
}

export function ThresholdForm({ rateLimit }: RateLimitFormProps) {
  const { form, flushOnBlur, settingGroupProps } = useSettingsCard<RateLimitSettings, RateLimitSettings>({
    section: 'rateLimit',
    source: rateLimit,
    toState: (source) => source,
    // This card owns the whole section, so its full state IS the honest patch.
    fromState: (state) => ({ ...state }),
    schema: rateLimitFormSchema,
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const resetAllToDefaults = () => {
    for (const key of ALL_KEYS) {
      form.setValue(key, { ...rateLimitDefaults[key] }, { shouldDirty: true, shouldValidate: true })
    }
    flushOnBlur()
  }

  return (
    <SettingGroup
      title="流控设置"
      description="各业务场景的限流策略。同一场景的按 IP / 按邮箱计数共用一组配置；时间窗口内超过最大尝试次数的请求将被拒绝。"
      actions={
        <button
          type="button"
          onClick={resetAllToDefaults}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" />
          全部恢复默认
        </button>
      }
      {...settingGroupProps}
    >
      <BucketTable keys={COMMON_KEYS} form={form} flushOnBlur={flushOnBlur} />

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          aria-expanded={showAdvanced}
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDownIcon className={cn('size-4 transition-transform', !showAdvanced && '-rotate-90')} />
          高级选项（{ADVANCED_GROUPS.reduce((count, group) => count + group.keys.length, 0)} 项）
        </button>
        {showAdvanced &&
          ADVANCED_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">{group.label}</h4>
              <BucketTable keys={group.keys} form={form} flushOnBlur={flushOnBlur} />
            </div>
          ))}
      </div>
    </SettingGroup>
  )
}

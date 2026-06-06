import type { UseFormReturn } from 'react-hook-form'

import { InfoIcon } from 'lucide-react'

import type { RateLimitSettings } from '@/shared/config/types'

import { BOUNDS, BUCKET_META, type BucketKey } from '@/ui/admin/settings/rate-limit/constants'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Tooltip } from '@/ui/components/tooltip'
import { cn } from '@/ui/lib/cn'

interface BucketEditRowProps {
  bucketKey: BucketKey
  form: UseFormReturn<RateLimitSettings>
}

export function BucketEditRow({ bucketKey, form }: BucketEditRowProps) {
  const meta = BUCKET_META[bucketKey]
  const errors = form.formState.errors
  const windowError = (errors[bucketKey] as { windowSeconds?: { message?: string } } | undefined)?.windowSeconds
    ?.message
  const attemptsError = (errors[bucketKey] as { maxAttempts?: { message?: string } } | undefined)?.maxAttempts?.message

  return (
    <div className="group flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-(--text-admin-base)">{meta.title}</span>
        <Tooltip>
          <Tooltip.Trigger as="span" className="cursor-help">
            <InfoIcon className="size-3.5 text-muted-foreground" />
          </Tooltip.Trigger>
          <Tooltip.Content>{meta.description}</Tooltip.Content>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">时间窗口</span>
          <div className="flex flex-wrap gap-1">
            {meta.quickWindowOptions.map((opt) => (
              <Button
                key={opt.seconds}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  form.setValue(`${bucketKey}.windowSeconds`, opt.seconds, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={BOUNDS.windowSeconds.min}
            max={BOUNDS.windowSeconds.max}
            className={cn(windowError && 'border-destructive')}
            {...form.register(`${bucketKey}.windowSeconds`, { valueAsNumber: true })}
          />
          {windowError ? <span className="text-xs text-destructive">{windowError}</span> : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">最大尝试次数</span>
          <Input
            type="number"
            min={BOUNDS.maxAttempts.min}
            max={BOUNDS.maxAttempts.max}
            className={cn(attemptsError && 'border-destructive')}
            {...form.register(`${bucketKey}.maxAttempts`, { valueAsNumber: true })}
          />
          {attemptsError ? <span className="text-xs text-destructive">{attemptsError}</span> : null}
        </div>
      </div>
    </div>
  )
}

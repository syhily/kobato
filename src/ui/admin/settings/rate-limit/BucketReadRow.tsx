import { InfoIcon } from 'lucide-react'

import { formatDuration } from '@/shared/utils/formatter'
import { BUCKET_META, type BucketKey } from '@/ui/admin/settings/rate-limit/constants'
import { Tooltip } from '@/ui/components/tooltip'

interface BucketReadRowProps {
  bucketKey: BucketKey
  bucket: { windowSeconds: number; maxAttempts: number }
}

export function BucketReadRow({ bucketKey, bucket }: BucketReadRowProps) {
  const meta = BUCKET_META[bucketKey]
  return (
    <div className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-(--text-admin-base)">{meta.title}</span>
          <Tooltip>
            <Tooltip.Trigger as="span" className="cursor-help">
              <InfoIcon className="size-3.5 text-muted-foreground" />
            </Tooltip.Trigger>
            <Tooltip.Content>{meta.description}</Tooltip.Content>
          </Tooltip>
        </div>
      </div>
      <div className="w-32 shrink-0 text-right text-(--text-admin-sm) text-muted-foreground">
        {formatDuration(bucket.windowSeconds)}
      </div>
      <div className="w-24 shrink-0 text-right text-(--text-admin-sm) text-muted-foreground tabular-nums">
        {bucket.maxAttempts} 次
      </div>
    </div>
  )
}

import { cn } from '@kobato/ui/lib/cn.ts'

export function NotificationBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) {
    return null
  }
  return (
    <span
      className={cn(
        'ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

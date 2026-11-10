import { cn } from '@/ui/lib/cn'

// The one unread-count pill shared by every notifications entry point (sidebar
// nav, user menus, drawer header). Renders nothing at zero.
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

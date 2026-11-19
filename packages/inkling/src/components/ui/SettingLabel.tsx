import { cx } from '@kobato/inkling-internal/utils/cx'

export function SettingLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('text-sm font-medium tracking-normal text-grey-900 dark:text-grey-300', className)}>
      {children}
    </div>
  )
}

export function SettingDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cx('text-xs leading-snug font-normal text-grey-700 dark:text-grey-600', className)}>{children}</p>
  )
}

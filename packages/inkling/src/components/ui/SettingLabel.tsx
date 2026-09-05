import { cx } from '@/utils/cx'

/**
 * The shared settings-panel label chrome: one class string for the row labels
 * that used to be pasted verbatim into every setting row. This is deliberately
 * NOT a full SettingRow abstraction — the rows' layouts genuinely diverge
 * (inline vs stacked vs sr-only), so only the label/description chrome is
 * single-sourced here.
 */
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

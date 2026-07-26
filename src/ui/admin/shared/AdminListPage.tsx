import { type ReactNode } from 'react'

import { AdminPagination } from '@/ui/admin/shared/AdminPagination'
import { Card, CardContent } from '@/ui/components/card'

function AdminListPageRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>
}

interface HeaderProps {
  title: ReactNode
  description?: string
  /**
   * Trailing slot rendered to the right of the title block on desktop,
   * stacked below it on narrow viewports. Use for refresh / export /
   * "new …" buttons; bulk-action toolbars belong inside `Toolbar`.
   */
  children?: ReactNode
}

function AdminListPageHeader({ title, description, children }: HeaderProps) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </header>
  )
}

interface ToolbarProps {
  /** Filter controls, tabs, bulk-action affordances. */
  children: ReactNode
}

function AdminListPageToolbar({ children }: ToolbarProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

interface BodyProps {
  children: ReactNode
}

function AdminListPageBody({ children }: BodyProps) {
  return <>{children}</>
}

interface PageNavigationProps {
  totalPages: number
  currentPage: number
  onChange: (page: number) => void
}

function AdminListPagePageNavigation({ totalPages, currentPage, onChange }: PageNavigationProps) {
  return <AdminPagination totalPages={totalPages} currentPage={currentPage} onChange={onChange} />
}

interface FilterFieldProps {
  /** Column label rendered above the control. Stays 28px tall to align with sibling columns that show a "X clear" button. */
  label: string
  /**
   * Optional trailing button rendered on the label row (e.g.
   * `<ClearFilterButton />`). When absent the row still reserves 28px so
   * a row of FilterFields doesn't jitter as filters are added or removed.
   */
  action?: ReactNode
  children: ReactNode
}

function FilterField({ label, action, children }: FilterFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-7 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

export const AdminListPage = Object.assign(AdminListPageRoot, {
  Header: AdminListPageHeader,
  Toolbar: AdminListPageToolbar,
  Body: AdminListPageBody,
  PageNavigation: AdminListPagePageNavigation,
  FilterField,
})

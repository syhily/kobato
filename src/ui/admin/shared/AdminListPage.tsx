import { type ReactNode } from 'react'
// Allow title to be a ReactNode so callers can compose inline elements
// (e.g. a count badge next to the heading text).

import { AdminPagination } from '@/ui/admin/shared/AdminPagination'
import { Card, CardContent } from '@/ui/components/card'

// The admin list pages (UsersView / CommentsView) all render a stack of
// header → toolbar (filters, tabs, bulk actions) → body (table or
// cards) → pagination. Both used to hand-roll the same outer
// `flex-col gap-6` wrapper, the same toolbar `Card`, and the same
// label-row spacing for filter columns. Extracting the skeleton here
// keeps each list page's JSX about 60 lines lighter and means a future
// toolbar redesign lands in one place.
//
// The compound is deliberately permissive about what goes inside each
// slot — both pages have slightly different filter layouts (UsersView
// is a single 5-column grid, CommentsView is tabs + 3 columns) and
// neither tries to normalize them past "label row stays 28px high so
// the columns line up even when only one column has a clear button".
//
// Usage:
//
//   <AdminListPage>
//     <AdminListPage.Header
//       title="评论管理"
//       description="审核、回复、编辑站点评论。"
//     >
//       <Button onClick={reload}><RefreshCwIcon /> 刷新</Button>
//     </AdminListPage.Header>
//
//     <AdminListPage.Toolbar>
//       <Tabs … />
//       <div className="grid gap-3 sm:grid-cols-3"> … </div>
//     </AdminListPage.Toolbar>
//
//     <AdminListPage.Body>
//       <Card className="overflow-hidden p-0">
//         <Table> … </Table>
//       </Card>
//     </AdminListPage.Body>
//
//     <AdminListPage.PageNavigation
//       totalPages={totalPages}
//       currentPage={state.currentPage}
//       onChange={(page) => dispatch({ type: 'setPage', value: page })}
//     />
//   </AdminListPage>

function AdminListPageRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>
}

interface HeaderProps {
  title: ReactNode
  description?: string
  /**
   * Trailing slot rendered to the right of the title block on desktop,
   * stacked below it on narrow viewports. Use for refresh / export /
   * "new …" buttons; bulk-action toolbars belong inside `Toolbar` so
   * they stay grouped with the filters that produced the selection.
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
  /** Column label rendered above the control. Stays 28px tall to align with sibling columns that show a "X 清除" button. */
  label: string
  /**
   * Optional trailing button rendered on the same row as the label
   * (e.g. `<ClearFilterButton />`). When absent the label row still
   * reserves 28px so a row of FilterFields doesn't jitter as the
   * editor adds or removes filters.
   */
  action?: ReactNode
  children: ReactNode
}

// Two-row column: label (left) + optional trailing action (right) on a
// fixed 28px-tall header row, then the control below. Replaces the
// previously hand-duplicated `flex-col gap-1.5` + nested `flex h-7
// items-center justify-between gap-2` markup that lived in both
// UsersView's filter grid and CommentsView's filter grid.
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

// Compound assembly. Internal sub-components are exposed only through
// `AdminListPage.<Slot>` so consumers can't accidentally import a
// helper out of context (e.g. dropping a `Header` into the body would
// reorder the page).
export const AdminListPage = Object.assign(AdminListPageRoot, {
  Header: AdminListPageHeader,
  Toolbar: AdminListPageToolbar,
  Body: AdminListPageBody,
  PageNavigation: AdminListPagePageNavigation,
  FilterField,
})

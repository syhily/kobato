/**
 * Shared filter-pill class — the single source of truth for the visual
 * language used by inline filter controls on admin list pages (posts,
 * images, friends).
 *
 * Why a class constant and not a component: each filter wraps a different
 * inner control (Select, Combobox, Input, Checkbox). A wrapper component
 * would need a boolean-prop matrix to switch between them; a shared class
 * keeps the visual tokens unified without constraining the control choice.
 *
 * `filterPill` is the base applied to every inline filter control.
 * `filterPillWithClear` is composed on top when the pill reserves space
 * for a trailing X clear button (hides the native chevron / value overflow).
 */
export const filterPill =
  'h-9 gap-1 rounded-(--radius) border-border px-3 text-(--text-admin-sm) font-medium shadow-none hover:bg-accent focus-visible:border-border focus-visible:ring-0 data-[popup-open]:border-border data-[popup-open]:ring-0'

export const filterPillWithClear = 'pr-7 [&>span:last-child]:hidden'

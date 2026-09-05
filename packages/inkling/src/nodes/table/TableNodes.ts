import { TableCellHeaderStates, TableCellNode, TableNode, TableRowNode } from '@lexical/table'

export { $createTableCellNode, $createTableNode, $createTableRowNode, TableCellHeaderStates } from '@lexical/table'
export { $isTableCellNode, $isTableNode, $isTableRowNode, TableCellNode, TableNode, TableRowNode } from '@lexical/table'

// The package keeps this type unexported; derive it from the states object.
export type TableCellHeaderState = (typeof TableCellHeaderStates)[keyof typeof TableCellHeaderStates]

/**
 * The upstream `@lexical/table` element family — deliberately not cards
 * (CONTEXT.md): a cell holds editable inline text with a real Lexical
 * selection, which the decorator card pipeline cannot provide. The family
 * joins `EDITOR_BASE_NODES` alongside LinkNode/ListNode, the other non-card
 * families; the cell guard (`@/nodes/table/table-cell-guard`) keeps every
 * cell inline-only.
 */
export const INKLING_TABLE_NODES = [TableNode, TableRowNode, TableCellNode]

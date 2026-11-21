import { TableCellHeaderStates, TableCellNode, TableNode, TableRowNode } from '@lexical/table'

export { $createTableCellNode, $createTableNode, $createTableRowNode, TableCellHeaderStates } from '@lexical/table'
export { $isTableCellNode, $isTableNode, $isTableRowNode, TableCellNode, TableNode, TableRowNode } from '@lexical/table'

export type TableCellHeaderState = (typeof TableCellHeaderStates)[keyof typeof TableCellHeaderStates]

export const INKLING_TABLE_NODES = [TableNode, TableRowNode, TableCellNode]

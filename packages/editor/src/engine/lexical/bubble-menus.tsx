import type { LexicalEditor } from 'lexical'

import { orpc } from '@kobato/client/api/client'
import { Button } from '@kobato/editor/engine/components/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@kobato/editor/engine/components/select'
import { Separator } from '@kobato/editor/engine/components/separator'
import { FloatingMenu } from '@kobato/editor/engine/lexical/floating-menu'
import { LinkPopover } from '@kobato/editor/engine/lexical/link-popover'
import { useToolbarSelectionState } from '@kobato/editor/engine/lexical/toolbar-state'
import { generateBlockKey } from '@kobato/shared/legacy-pt/utils'
import { $createInlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import { $isCodeNode } from '@lexical/code'
import { LinkNode } from '@lexical/link'
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableColumnIndexFromTableCellNode,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $getTableRowNodeFromTableCellNodeOrThrow,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $mergeCells,
  $unmergeCell,
  TableCellHeaderStates,
} from '@lexical/table'
import { $getNearestNodeOfType } from '@lexical/utils'
import { $createParagraphNode, $getSelection, $isElementNode, $isRangeSelection, FORMAT_TEXT_COMMAND } from 'lexical'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BoldIcon,
  Code2Icon,
  ColumnsIcon as HeaderColumnIcon,
  CombineIcon,
  ExternalLinkIcon,
  ItalicIcon,
  LinkIcon,
  MinusSquareIcon,
  RowsIcon as HeaderRowIcon,
  SigmaIcon,
  SplitIcon,
  StrikethroughIcon,
  Trash2Icon,
  UnderlineIcon,
} from 'lucide-react'
import { useState } from 'react'

/**
 * The floating bubble trio — the Lexical port of the tiptap
 * `PageBubbleMenu` / `TableBubbleMenu` / `CodeBlockBubbleMenu`. All three
 * share the `FloatingMenu` anchor (selection range vs table caret vs code
 * caret); the content mirrors the tiptap button rows 1:1.
 *
 * Table operations map onto the `@lexical/table` selection helpers —
 * tiptap command names are noted on each button for the parity audit:
 * addRowBefore/After → `$insertTableRowAtSelection`, addColumnBefore/After →
 * `$insertTableColumnAtSelection`, deleteRow/Column → `$delete*AtSelection`,
 * toggleHeaderRow/Column → headerState bit flips (1 = row, 2 = column),
 * mergeCells → `$mergeCells` (≥2 selected cells), splitCell → `$unmergeCell`,
 * deleteTable → TableNode removal with caret recovery.
 */

// --- PageBubbleMenu ---------------------------------------------------------

export interface PageBubbleMenuProps {
  editor: LexicalEditor
}

export function PageBubbleMenu({ editor }: PageBubbleMenuProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const state = useToolbarSelectionState(editor)

  return (
    <FloatingMenu editor={editor} hide={linkOpen}>
      {linkOpen ? (
        <LinkPopover variant="selection" editor={editor} onClose={() => setLinkOpen(false)} />
      ) : (
        <div className="flex items-center gap-0.5 px-1 py-1">
          <Toggle
            title="加粗"
            state={state.isBold ? 'active' : 'inactive'}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
          >
            <BoldIcon />
          </Toggle>
          <Toggle
            title="斜体"
            state={state.isItalic ? 'active' : 'inactive'}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
          >
            <ItalicIcon />
          </Toggle>
          <Toggle
            title="下划线"
            state={state.isUnderline ? 'active' : 'inactive'}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
          >
            <UnderlineIcon />
          </Toggle>
          <Toggle
            title="删除线"
            state={state.isStrikethrough ? 'active' : 'inactive'}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
          >
            <StrikethroughIcon />
          </Toggle>
          <Toggle
            title="行内代码"
            state={state.isCode ? 'active' : 'inactive'}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
          >
            <Code2Icon />
          </Toggle>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Toggle
            title="链接"
            state={state.isLink ? 'active' : 'inactive'}
            onClick={() => {
              setLinkOpen(true)
            }}
          >
            <LinkIcon />
          </Toggle>
          <Toggle
            title="行内公式（大分式请加 \\displaystyle；多行用 / 公式块）"
            onClick={() => {
              void insertMathInline(editor)
            }}
          >
            <SigmaIcon />
          </Toggle>
          <BubbleLinkPreview editor={editor} />
        </div>
      )}
    </FloatingMenu>
  )
}

function BubbleLinkPreview({ editor }: { editor: LexicalEditor }) {
  let href = ''
  let newTab = false
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    const link = $getNearestNodeOfType(selection.anchor.getNode(), LinkNode)
    if (link !== null) {
      href = link.getURL()
      newTab = link.getTarget() === '_blank'
    }
  })
  if (href === '') {
    return null
  }
  return (
    <a
      href={href}
      {...(newTab ? { target: '_blank' as const, rel: 'noreferrer noopener' as const } : {})}
      title={newTab ? '在新标签页打开' : '打开链接'}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
    >
      <ExternalLinkIcon className="size-3.5" />
    </a>
  )
}

async function insertMathInline(editor: LexicalEditor): Promise<void> {
  const selection = editor.getEditorState().read(() => $getSelection())
  if (!(selection !== null && $isRangeSelection(selection))) {
    return
  }
  const hasRange = !selection.isCollapsed()
  const selected = hasRange ? selection.getTextContent() : ''
  const tex = selected.trim() === '' ? 'a^2' : selected.trim()

  let mathml: string | undefined
  if (tex.trim() !== '') {
    const out = await orpc.admin.renders.math({ tex, display: false })
    if (out.error === null && out.mathml !== '') {
      mathml = out.mathml
    }
  }

  const ptKey = generateBlockKey()
  editor.update(() => {
    const current = $getSelection()
    if (!(current !== null && $isRangeSelection(current))) {
      return
    }
    current.insertNodes([$createInlineMathNode(tex, mathml, undefined, ptKey)])
  })
}

interface ToggleProps {
  title: string
  state?: 'active' | 'inactive'
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function Toggle({ title, state, onClick, disabled, children }: ToggleProps) {
  const isActive = state === 'active'
  return (
    <Button
      type="button"
      variant={isActive ? 'secondary' : 'ghost'}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className="size-7"
    >
      {children}
    </Button>
  )
}

// --- TableBubbleMenu ----------------------------------------------------------

export interface TableBubbleMenuProps {
  editor: LexicalEditor
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  return (
    <FloatingMenu editor={editor}>
      <div className="flex flex-wrap items-center gap-0.5 px-1 py-1">
        <TableButton title="上方插行" onClick={() => tableCommand(editor, addRowBefore)}>
          <ArrowUpIcon />
        </TableButton>
        <TableButton title="下方插行" onClick={() => tableCommand(editor, addRowAfter)}>
          <ArrowDownIcon />
        </TableButton>
        <TableButton title="左侧插列" onClick={() => tableCommand(editor, addColumnBefore)}>
          <ArrowLeftIcon />
        </TableButton>
        <TableButton title="右侧插列" onClick={() => tableCommand(editor, addColumnAfter)}>
          <ArrowRightIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton title="删除当前行" onClick={() => tableCommand(editor, deleteRow)}>
          <MinusSquareIcon />
        </TableButton>
        <TableButton title="删除当前列" onClick={() => tableCommand(editor, deleteColumn)}>
          <MinusSquareIcon className="rotate-90" />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton title="切换表头行" onClick={() => tableCommand(editor, toggleHeaderRow)}>
          <HeaderRowIcon />
        </TableButton>
        <TableButton title="切换表头列" onClick={() => tableCommand(editor, toggleHeaderColumn)}>
          <HeaderColumnIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton title="合并选中单元格" onClick={() => tableCommand(editor, mergeCells)}>
          <CombineIcon />
        </TableButton>
        <TableButton title="拆分单元格" onClick={() => tableCommand(editor, splitCell)}>
          <SplitIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton title="删除整张表" onClick={() => tableCommand(editor, deleteTable)}>
          <Trash2Icon />
        </TableButton>
      </div>
    </FloatingMenu>
  )
}

interface TableButtonProps {
  title: string
  onClick: () => void
  children: React.ReactNode
}

function TableButton({ title, onClick, children }: TableButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="size-7"
    >
      {children}
    </Button>
  )
}

function tableCommand(editor: LexicalEditor, run: (editor: LexicalEditor) => void): void {
  editor.update(() => run(editor))
}

function $getCaretCell(): import('@lexical/table').TableCellNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return null
  }
  return $getTableCellNodeFromLexicalNode(selection.anchor.getNode())
}

function addRowBefore(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  $insertTableRowAtSelection(false)
}

function addRowAfter(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  $insertTableRowAtSelection(true)
}

function addColumnBefore(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  $insertTableColumnAtSelection(false)
}

function addColumnAfter(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  $insertTableColumnAtSelection(true)
}

function deleteRow(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  $deleteTableRowAtSelection()
}

function deleteColumn(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  $deleteTableColumnAtSelection()
}

function toggleHeaderRow(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  const row = $getTableRowNodeFromTableCellNodeOrThrow(cell)
  for (const child of row.getChildren()) {
    if ($isTableCellNode(child)) {
      child.toggleHeaderStyle(TableCellHeaderStates.ROW)
    }
  }
}

function toggleHeaderColumn(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  const table = $getTableNodeFromLexicalNodeOrThrow(cell)
  const columnIndex = $getTableColumnIndexFromTableCellNode(cell)
  for (const row of table.getChildren()) {
    if (!$isElementNode(row)) {
      continue
    }
    const target = row.getChildAtIndex(columnIndex)
    if ($isTableCellNode(target)) {
      target.toggleHeaderStyle(TableCellHeaderStates.COLUMN)
    }
  }
}

function mergeCells(_editor: LexicalEditor): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }
  const cells: import('@lexical/table').TableCellNode[] = []
  const seen = new Set<string>()
  for (const node of selection.getNodes()) {
    const cell = $getTableCellNodeFromLexicalNode(node)
    if (cell !== null && !seen.has(cell.getKey())) {
      seen.add(cell.getKey())
      cells.push(cell)
    }
  }
  if (cells.length >= 2) {
    $mergeCells(cells)
  }
}

function splitCell(_editor: LexicalEditor): void {
  $unmergeCell()
}

function deleteTable(_editor: LexicalEditor): void {
  const cell = $getCaretCell()
  if (cell === null) {
    return
  }
  const table = $getTableNodeFromLexicalNodeOrThrow(cell)
  const parent = table.getParent()
  if (parent === null) {
    return
  }
  const index = table.getIndexWithinParent()
  const after = parent.getChildAtIndex(index + 1)
  const before = parent.getChildAtIndex(index - 1)
  const target = after ?? before
  if (target === null) {
    const paragraph = $createParagraphNode()
    table.replace(paragraph)
    paragraph.selectStart()
  } else {
    table.remove()
    if ($isElementNode(target)) {
      target.selectStart()
    }
  }
}

// --- CodeBlockBubbleMenu --------------------------------------------------------

// Curated language catalogue — same groups/options as the tiptap
// `CodeBlockBubbleMenu` (kept local to avoid touching the tiptap engine).

interface LanguageOption {
  value: string
  label: string
}

interface LanguageGroup {
  label: string
  options: LanguageOption[]
}

const LANGUAGE_GROUPS: LanguageGroup[] = [
  {
    label: '通用',
    options: [
      { value: 'plaintext', label: '纯文本' },
      { value: 'bash', label: 'Bash' },
      { value: 'shell', label: 'Shell' },
      { value: 'powershell', label: 'PowerShell' },
      { value: 'diff', label: 'Diff' },
      { value: 'http', label: 'HTTP' },
    ],
  },
  {
    label: '前端',
    options: [
      { value: 'html', label: 'HTML' },
      { value: 'css', label: 'CSS' },
      { value: 'scss', label: 'SCSS' },
      { value: 'javascript', label: 'JavaScript' },
      { value: 'typescript', label: 'TypeScript' },
      { value: 'jsx', label: 'JSX' },
      { value: 'tsx', label: 'TSX' },
      { value: 'vue', label: 'Vue' },
      { value: 'svelte', label: 'Svelte' },
    ],
  },
  {
    label: '后端 / 系统',
    options: [
      { value: 'python', label: 'Python' },
      { value: 'java', label: 'Java' },
      { value: 'kotlin', label: 'Kotlin' },
      { value: 'go', label: 'Go' },
      { value: 'rust', label: 'Rust' },
      { value: 'c', label: 'C' },
      { value: 'cpp', label: 'C++' },
      { value: 'csharp', label: 'C#' },
      { value: 'php', label: 'PHP' },
      { value: 'ruby', label: 'Ruby' },
      { value: 'swift', label: 'Swift' },
      { value: 'objective-c', label: 'Objective-C' },
      { value: 'scala', label: 'Scala' },
      { value: 'dart', label: 'Dart' },
      { value: 'lua', label: 'Lua' },
    ],
  },
  {
    label: '数据 / 配置',
    options: [
      { value: 'json', label: 'JSON' },
      { value: 'yaml', label: 'YAML' },
      { value: 'toml', label: 'TOML' },
      { value: 'xml', label: 'XML' },
      { value: 'sql', label: 'SQL' },
      { value: 'graphql', label: 'GraphQL' },
      { value: 'dockerfile', label: 'Dockerfile' },
      { value: 'nginx', label: 'Nginx' },
      { value: 'markdown', label: 'Markdown' },
      { value: 'tex', label: 'TeX / LaTeX' },
    ],
  },
]

const KNOWN_VALUES = new Set(LANGUAGE_GROUPS.flatMap((group) => group.options.map((option) => option.value)))
const PLACEHOLDER_VALUE = 'plaintext'

export interface CodeBlockBubbleMenuProps {
  editor: LexicalEditor
}

export function CodeBlockBubbleMenu({ editor }: CodeBlockBubbleMenuProps) {
  return (
    <FloatingMenu editor={editor}>
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-xs text-muted-foreground">代码语言</span>
        <CodeLanguageSelect editor={editor} />
      </div>
    </FloatingMenu>
  )
}

function CodeLanguageSelect({ editor }: CodeBlockBubbleMenuProps) {
  let current = PLACEHOLDER_VALUE
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    let cursor: import('lexical').LexicalNode | null = selection.anchor.getNode()
    while (cursor !== null) {
      if ($isCodeNode(cursor)) {
        const language = cursor.getLanguage()
        if (typeof language === 'string' && language !== '') {
          current = language
        }
        return
      }
      cursor = cursor.getParent()
    }
  })
  const isKnown = KNOWN_VALUES.has(current)
  return (
    <Select
      value={isKnown ? current : PLACEHOLDER_VALUE}
      onValueChange={(value: string | null) => {
        if (typeof value !== 'string') {
          return
        }
        const next = value === PLACEHOLDER_VALUE ? null : value
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return
          }
          let cursor: import('lexical').LexicalNode | null = selection.anchor.getNode()
          while (cursor !== null) {
            if ($isCodeNode(cursor)) {
              cursor.setLanguage(next)
              return
            }
            cursor = cursor.getParent()
          }
        })
      }}
    >
      <SelectTrigger size="sm" className="h-7 min-w-32" aria-label="代码语言">
        <SelectValue placeholder="选择语言">
          {(value) => labelFor(typeof value === 'string' ? value : '') ?? (isKnown ? '' : current)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGE_GROUPS.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function labelFor(value: string): string | undefined {
  for (const group of LANGUAGE_GROUPS) {
    const match = group.options.find((option) => option.value === value)
    if (match) {
      return match.label
    }
  }
  return undefined
}

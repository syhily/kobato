import type { Editor } from '@tiptap/core'

import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CombineIcon,
  RowsIcon as HeaderRowIcon,
  ColumnsIcon as HeaderColumnIcon,
  MinusSquareIcon,
  SplitIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/ui/components/button'
import { Separator } from '@/ui/components/separator'

// Table action bar; each button consults `editor.can()` so unavailable commands grey out.

const TABLE_BUBBLE_MENU_OPTIONS = { placement: 'top' as const, offset: 8 }

export interface TableBubbleMenuProps {
  editor: Editor
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  // The BubbleMenu portal never re-renders children on transactions — subscribe
  // command availability explicitly or the buttons stay enabled/disabled stale.
  const canRun = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      addRowBefore: ed.can().addRowBefore(),
      addRowAfter: ed.can().addRowAfter(),
      addColumnBefore: ed.can().addColumnBefore(),
      addColumnAfter: ed.can().addColumnAfter(),
      deleteRow: ed.can().deleteRow(),
      deleteColumn: ed.can().deleteColumn(),
      toggleHeaderRow: ed.can().toggleHeaderRow(),
      toggleHeaderColumn: ed.can().toggleHeaderColumn(),
      mergeCells: ed.can().mergeCells(),
      splitCell: ed.can().splitCell(),
      deleteTable: ed.can().deleteTable(),
    }),
  })
  return (
    <BubbleMenu
      editor={editor}
      options={TABLE_BUBBLE_MENU_OPTIONS}
      shouldShow={({ editor: instance }) => instance.isEditable && instance.isActive('table')}
      className="z-50 rounded-xl border bg-popover text-popover-foreground shadow-md"
    >
      <div className="flex flex-wrap items-center gap-0.5 px-1 py-1">
        <TableButton
          title="上方插行"
          onClick={() => editor.chain().focus().addRowBefore().run()}
          disabled={!canRun.addRowBefore}
        >
          <ArrowUpIcon />
        </TableButton>
        <TableButton
          title="下方插行"
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!canRun.addRowAfter}
        >
          <ArrowDownIcon />
        </TableButton>
        <TableButton
          title="左侧插列"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          disabled={!canRun.addColumnBefore}
        >
          <ArrowLeftIcon />
        </TableButton>
        <TableButton
          title="右侧插列"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!canRun.addColumnAfter}
        >
          <ArrowRightIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="删除当前行"
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!canRun.deleteRow}
        >
          <MinusSquareIcon />
        </TableButton>
        <TableButton
          title="删除当前列"
          onClick={() => editor.chain().focus().deleteColumn().run()}
          disabled={!canRun.deleteColumn}
        >
          <MinusSquareIcon className="rotate-90" />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="切换表头行"
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          disabled={!canRun.toggleHeaderRow}
        >
          <HeaderRowIcon />
        </TableButton>
        <TableButton
          title="切换表头列"
          onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
          disabled={!canRun.toggleHeaderColumn}
        >
          <HeaderColumnIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="合并选中单元格"
          onClick={() => editor.chain().focus().mergeCells().run()}
          disabled={!canRun.mergeCells}
        >
          <CombineIcon />
        </TableButton>
        <TableButton
          title="拆分单元格"
          onClick={() => editor.chain().focus().splitCell().run()}
          disabled={!canRun.splitCell}
        >
          <SplitIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="删除整张表"
          onClick={() => editor.chain().focus().deleteTable().run()}
          disabled={!canRun.deleteTable}
        >
          <Trash2Icon />
        </TableButton>
      </div>
    </BubbleMenu>
  )
}

interface TableButtonProps {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function TableButton({ title, onClick, disabled, children }: TableButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="size-7"
    >
      {children}
    </Button>
  )
}

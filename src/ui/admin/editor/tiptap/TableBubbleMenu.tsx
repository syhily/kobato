import type { Editor } from '@tiptap/core'

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

// Floating action bar that appears whenever the selection is inside
// a Tiptap table. The buttons map 1:1 onto Tiptap's table command
// names; each button consults `editor.can()` so that, e.g., "merge
// cells" greys out when fewer than two cells are selected.

const TABLE_BUBBLE_MENU_OPTIONS = { placement: 'top' as const, offset: 8 }

export interface TableBubbleMenuProps {
  editor: Editor
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
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
          disabled={!editor.can().addRowBefore()}
        >
          <ArrowUpIcon />
        </TableButton>
        <TableButton
          title="下方插行"
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!editor.can().addRowAfter()}
        >
          <ArrowDownIcon />
        </TableButton>
        <TableButton
          title="左侧插列"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          disabled={!editor.can().addColumnBefore()}
        >
          <ArrowLeftIcon />
        </TableButton>
        <TableButton
          title="右侧插列"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!editor.can().addColumnAfter()}
        >
          <ArrowRightIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="删除当前行"
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!editor.can().deleteRow()}
        >
          <MinusSquareIcon />
        </TableButton>
        <TableButton
          title="删除当前列"
          onClick={() => editor.chain().focus().deleteColumn().run()}
          disabled={!editor.can().deleteColumn()}
        >
          <MinusSquareIcon className="rotate-90" />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="切换表头行"
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          disabled={!editor.can().toggleHeaderRow()}
        >
          <HeaderRowIcon />
        </TableButton>
        <TableButton
          title="切换表头列"
          onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
          disabled={!editor.can().toggleHeaderColumn()}
        >
          <HeaderColumnIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="合并选中单元格"
          onClick={() => editor.chain().focus().mergeCells().run()}
          disabled={!editor.can().mergeCells()}
        >
          <CombineIcon />
        </TableButton>
        <TableButton
          title="拆分单元格"
          onClick={() => editor.chain().focus().splitCell().run()}
          disabled={!editor.can().splitCell()}
        >
          <SplitIcon />
        </TableButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <TableButton
          title="删除整张表"
          onClick={() => editor.chain().focus().deleteTable().run()}
          disabled={!editor.can().deleteTable()}
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

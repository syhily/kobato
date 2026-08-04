import type { LexicalEditor } from 'lexical'

import { Button } from '@kobato/editor/engine/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@kobato/editor/engine/components/popover'
import { Separator } from '@kobato/editor/engine/components/separator'
import {
  applyAlign,
  insertBulletList,
  insertOrderedList,
  removeList,
} from '@kobato/editor/engine/lexical/block-commands'
import {
  INSERT_HORIZONTAL_RULE_COMMAND,
  OPEN_FOOTNOTE_DIALOG_COMMAND,
  OPEN_IMAGE_PICKER_COMMAND,
  OPEN_MUSIC_PICKER_COMMAND,
} from '@kobato/editor/engine/lexical/commands'
import { LinkPopover } from '@kobato/editor/engine/lexical/link-popover'
import { useToolbarSelectionState } from '@kobato/editor/engine/lexical/toolbar-state'
import { AlignSelect } from '@kobato/editor/engine/lexical/toolbar/align-select'
import { BlockStyleButtons, BlockStyleSelect } from '@kobato/editor/engine/lexical/toolbar/block-style'
import { cn } from '@kobato/editor/engine/lib/cn'
import { useMediaQuery } from '@kobato/editor/engine/lib/use-media-query'
import { DensityToggleButton, type ToolbarDensity } from '@kobato/editor/engine/toolbar/density'
import { ToolbarButton } from '@kobato/editor/engine/toolbar/ToolbarButton'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { INSERT_TABLE_COMMAND, type InsertTableCommandPayload } from '@lexical/table'
import { FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  Code2Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  Music2Icon,
  PlusIcon,
  Redo2Icon,
  StrikethroughIcon,
  SuperscriptIcon,
  TableIcon,
  Undo2Icon,
  UnderlineIcon,
} from 'lucide-react'
import { useState } from 'react'

/**
 * Toolbar for the Lexical engine — the structural port of the tiptap
 * `Toolbar.tsx` (same groups, same density semantics, same Tailwind
 * chrome). Commands replace the tiptap chain calls:
 *
 *   undo/redo          → UNDO_COMMAND / REDO_COMMAND (full density only)
 *   block style        → FORMAT_PARAGRAPH_COMMAND / FORMAT_HEADING_COMMAND /
 *                        $setBlocksType (quote / code, never unwraps)
 *   align              → FORMAT_ELEMENT_COMMAND (3 keys, tiptap parity)
 *   bold/italic/…      → FORMAT_TEXT_COMMAND
 *   footnote           → OPEN_FOOTNOTE_DIALOG_COMMAND (disabled inside
 *                        tables / code blocks — `canInsertFootnote`
 *                        equivalent)
 *   lists              → INSERT_*_LIST_COMMAND / REMOVE_LIST_COMMAND
 *   image / music      → OPEN_*_PICKER_COMMAND (picker-registry → host)
 *   table              → INSERT_TABLE_COMMAND (3×3 with header row)
 *   link               → TOGGLE_LINK_COMMAND (via the toolbar LinkPopover)
 *   horizontal rule    → INSERT_HORIZONTAL_RULE_COMMAND
 *
 * The host-facing callbacks (`onOpenImagePicker` etc.) that the tiptap
 * toolbar receives as props are replaced by the command surface — the
 * editor wires those commands to the host handlers via the picker /
 * footnote registries, so the toolbar never needs the host props.
 */

export interface LexicalToolbarProps {
  editor: LexicalEditor
  disabled?: boolean
  density: ToolbarDensity
  onDensityChange: (next: ToolbarDensity) => void
  /** Merged onto the outer toolbar row (e.g. floated duplicate drops `border-b`). */
  className?: string
}

export function LexicalToolbar(props: LexicalToolbarProps) {
  const { editor, disabled, className } = props
  const isMobile = useMediaQuery('(max-width: 639px)')
  const density: ToolbarDensity = isMobile ? 'full' : props.density

  const state = useToolbarSelectionState(editor)

  const [linkToolbarOpen, setLinkToolbarOpen] = useState(false)

  const focusAnd = (action: () => void) => {
    editor.focus()
    action()
  }

  const insertButtons = (
    <>
      <ToolbarButton
        title="插入图片"
        disabled={disabled}
        onClick={() => focusAnd(() => editor.dispatchCommand(OPEN_IMAGE_PICKER_COMMAND, undefined))}
      >
        <ImageIcon />
      </ToolbarButton>
      <ToolbarButton
        title="插入音乐"
        disabled={disabled}
        onClick={() => focusAnd(() => editor.dispatchCommand(OPEN_MUSIC_PICKER_COMMAND, undefined))}
      >
        <Music2Icon />
      </ToolbarButton>
      <ToolbarButton
        title="插入表格 (3×3 含表头)"
        disabled={disabled}
        onClick={() =>
          focusAnd(() =>
            editor.dispatchCommand(
              INSERT_TABLE_COMMAND,
              unsafeCast<InsertTableCommandPayload>({ rows: 3, columns: 3, includeHeaders: true }),
            ),
          )
        }
      >
        <TableIcon />
      </ToolbarButton>
      <Popover
        open={linkToolbarOpen}
        onOpenChange={(open) => {
          if (open) {
            editor.focus()
          }
          setLinkToolbarOpen(open)
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant={state.isLink ? 'secondary' : 'ghost'}
              size="sm"
              disabled={disabled}
              title="链接"
              aria-label="链接"
              aria-pressed={state.isLink}
              onMouseDownCapture={(event) => {
                event.preventDefault()
              }}
            >
              <LinkIcon />
            </Button>
          }
        />
        <PopoverContent align="start" sideOffset={6} className="w-auto border-0 bg-transparent p-0 shadow-none">
          {linkToolbarOpen ? (
            <LinkPopover
              variant="toolbar"
              editor={editor}
              onClose={() => {
                setLinkToolbarOpen(false)
              }}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      <ToolbarButton
        title="水平分隔线"
        disabled={disabled}
        onClick={() => focusAnd(() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined))}
      >
        <MinusIcon />
      </ToolbarButton>
    </>
  )

  const groups = (
    <>
      {density === 'full' ? (
        <UndoRedoGroup editor={editor} disabled={disabled} state={state} focusAnd={focusAnd} />
      ) : null}
      <BlockStyleGroup editor={editor} disabled={disabled} density={density} state={state} focusAnd={focusAnd} />
      <AlignGroup editor={editor} disabled={disabled} density={density} state={state} focusAnd={focusAnd} />
      <ToolbarGroup>
        <ToolbarButton
          title="加粗 (Cmd/Ctrl+B)"
          disabled={disabled}
          state={state.isBold ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'))}
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          title="斜体 (Cmd/Ctrl+I)"
          disabled={disabled}
          state={state.isItalic ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'))}
        >
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton
          title="下划线 (Cmd/Ctrl+U)"
          disabled={disabled}
          state={state.isUnderline ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'))}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          title="删除线"
          disabled={disabled}
          state={state.isStrikethrough ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'))}
        >
          <StrikethroughIcon />
        </ToolbarButton>
        <ToolbarButton
          title="行内代码"
          disabled={disabled}
          state={state.isCode ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'))}
        >
          <Code2Icon />
        </ToolbarButton>
        <ToolbarButton
          title="脚注引用（^ 空格快捷插入；行内上标；表格与代码块内不可用）"
          disabled={disabled || !state.canInsertFootnote}
          onClick={() => focusAnd(() => editor.dispatchCommand(OPEN_FOOTNOTE_DIALOG_COMMAND, undefined))}
        >
          <SuperscriptIcon />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton
          title="无序列表"
          disabled={disabled}
          state={state.isBulletList ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => (state.isBulletList ? removeList(editor) : insertBulletList(editor)))}
        >
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton
          title="有序列表"
          disabled={disabled}
          state={state.isOrderedList ? 'active' : 'inactive'}
          onClick={() => focusAnd(() => (state.isOrderedList ? removeList(editor) : insertOrderedList(editor)))}
        >
          <ListOrderedIcon />
        </ToolbarButton>
      </ToolbarGroup>
      <InsertsGroup density={density} disabled={disabled}>
        {insertButtons}
      </InsertsGroup>
    </>
  )

  const densityRail = isMobile ? null : (
    <DensityToggleButton density={props.density} onChange={props.onDensityChange} disabled={disabled} />
  )

  const isCompact = density === 'compact'

  return (
    <div
      className={cn(
        'flex w-full max-w-full min-w-0 items-center gap-x-0.5 border-b p-2',
        isCompact || isMobile ? 'flex-nowrap overflow-x-auto' : 'flex-wrap gap-y-1',
        className,
      )}
    >
      {groups}
      {densityRail ? (
        <ToolbarGroup hideTrailingSeparator className="ml-auto shrink-0">
          {densityRail}
        </ToolbarGroup>
      ) : null}
    </div>
  )
}

interface ToolbarGroupProps {
  children: React.ReactNode
  hideTrailingSeparator?: boolean
  className?: string
}

function ToolbarGroup({ children, hideTrailingSeparator, className }: ToolbarGroupProps) {
  return (
    <div className={cn('flex flex-nowrap items-center gap-0.5', className)}>
      {children}
      {hideTrailingSeparator !== true ? (
        <Separator orientation="vertical" className="mx-1 h-6" aria-hidden="true" />
      ) : null}
    </div>
  )
}

interface GroupProps {
  editor: LexicalEditor
  disabled?: boolean
  state: ReturnType<typeof useToolbarSelectionState>
}

function UndoRedoGroup({ editor, disabled, state, focusAnd }: GroupProps & { focusAnd: (action: () => void) => void }) {
  return (
    <ToolbarGroup>
      <ToolbarButton
        title="撤销 (Cmd/Ctrl+Z)"
        disabled={disabled || !state.canUndo}
        onClick={() => focusAnd(() => editor.dispatchCommand(UNDO_COMMAND, undefined))}
      >
        <Undo2Icon />
      </ToolbarButton>
      <ToolbarButton
        title="重做 (Cmd/Ctrl+Shift+Z)"
        disabled={disabled || !state.canRedo}
        onClick={() => focusAnd(() => editor.dispatchCommand(REDO_COMMAND, undefined))}
      >
        <Redo2Icon />
      </ToolbarButton>
    </ToolbarGroup>
  )
}

interface DensityGroupProps extends GroupProps {
  density: ToolbarDensity
  focusAnd: (action: () => void) => void
}

function BlockStyleGroup({ editor, disabled, density, state }: DensityGroupProps) {
  return (
    <ToolbarGroup>
      {density === 'full' ? (
        <BlockStyleButtons editor={editor} active={state.blockStyle} disabled={disabled} />
      ) : (
        <BlockStyleSelect editor={editor} active={state.blockStyle} disabled={disabled} />
      )}
    </ToolbarGroup>
  )
}

function AlignGroup({ editor, disabled, density, state, focusAnd }: DensityGroupProps) {
  if (density === 'compact') {
    return (
      <ToolbarGroup>
        <AlignSelect editor={editor} active={state.align} disabled={disabled} />
      </ToolbarGroup>
    )
  }
  return (
    <ToolbarGroup>
      <ToolbarButton
        title="居左"
        disabled={disabled}
        state={state.align === 'left' ? 'active' : 'inactive'}
        onClick={() => focusAnd(() => applyAlign(editor, 'left'))}
      >
        <AlignLeftIcon />
      </ToolbarButton>
      <ToolbarButton
        title="居中"
        disabled={disabled}
        state={state.align === 'center' ? 'active' : 'inactive'}
        onClick={() => focusAnd(() => applyAlign(editor, 'center'))}
      >
        <AlignCenterIcon />
      </ToolbarButton>
      <ToolbarButton
        title="居右"
        disabled={disabled}
        state={state.align === 'right' ? 'active' : 'inactive'}
        onClick={() => focusAnd(() => applyAlign(editor, 'right'))}
      >
        <AlignRightIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
}

interface InsertsGroupProps {
  density: ToolbarDensity
  disabled?: boolean
  children: React.ReactNode
}

function InsertsGroup({ density, disabled, children }: InsertsGroupProps) {
  if (density === 'full') {
    return <ToolbarGroup>{children}</ToolbarGroup>
  }
  return (
    <ToolbarGroup>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              title="插入图片 / 音乐 / 表格 / 链接 / 分隔线"
              aria-label="插入元素"
            >
              <PlusIcon /> 插入
            </Button>
          }
        />
        <PopoverContent align="start" sideOffset={6} className="w-auto p-1">
          <div className="flex flex-wrap items-center gap-0.5">{children}</div>
        </PopoverContent>
      </Popover>
    </ToolbarGroup>
  )
}

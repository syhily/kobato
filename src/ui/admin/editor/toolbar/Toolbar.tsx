import type { Editor } from '@tiptap/core'

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
import { useEffect, useState } from 'react'

import { canInsertFootnoteMark } from '@/ui/admin/editor/tiptap/insert-inline-footnote'
import { LinkPopover } from '@/ui/admin/editor/tiptap/LinkPopover'
import { AlignSelect } from '@/ui/admin/editor/toolbar/AlignSelect'
import { BlockStyleButtons, BlockStyleSelect } from '@/ui/admin/editor/toolbar/BlockStyle'
import { DensityToggleButton, type ToolbarDensity } from '@/ui/admin/editor/toolbar/density'
import { ToolbarButton } from '@/ui/admin/editor/toolbar/ToolbarButton'
import { Button } from '@/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { Separator } from '@/ui/components/separator'
import { cn } from '@/ui/lib/cn'

export interface ToolbarProps {
  editor: Editor
  disabled?: boolean
  density: ToolbarDensity
  onDensityChange: (next: ToolbarDensity) => void
  onOpenImagePicker: () => void
  onOpenMusicPicker: () => void
  onOpenFootnoteInsertDialog: () => void
  /** Merged onto the outer toolbar row (e.g. floated duplicate drops `border-b`). */
  className?: string
}

// Toolbar layered into a stack of `ToolbarGroup`s (see groups below).
// Undo / redo only render in 'full' density. Tiptap's History
// extension wires Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z in every mode, so
// 'compact' falls back to the keyboard to save the two slots.
//
// Full density: the outer container is `flex flex-wrap` so groups
// flow to extra rows when space is tight (whole groups stay together).
// Compact density uses the same wrap rules with Select + 「插入」Popover.
//
// Each `ToolbarGroup` is `flex flex-nowrap` with a trailing separator.
// The picker triggers (image / music) own their own picker dialogs,
// so we MUST mount the inserts buttons exactly once per render to
// avoid duplicate dialog state. That's why we branch on `density`
// first and pick a single branch, instead of rendering both
// branches and toggling visibility with CSS.
//
// The slash menu (`/`) and bubble menu still cover the same surface
// for keyboard-first authoring; the toolbar exists so the editor
// looks self-evidently capable on first open.
// `<sm` (= `<640px`) collapses every density-branched control to its
// icon-only form, regardless of the operator's stored density
// preference. Forcing `'full'` keeps every button as a single icon,
// drops the 「插入 ▼」 popover wrapper, and lets the toolbar live as a
// one-row, horizontally-scrollable strip — the standard mobile
// editor pattern. The density toggle is hidden in the same window so
// the operator can't toggle into a state we'd silently override.
function useMobileToolbar(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return isMobile
}

export function Toolbar(props: ToolbarProps) {
  const { editor, disabled, className } = props
  const isMobile = useMobileToolbar()
  const density: ToolbarDensity = isMobile ? 'full' : props.density

  const [linkToolbarOpen, setLinkToolbarOpen] = useState(false)

  const insertButtons = (
    <>
      <ToolbarButton title="插入图片" disabled={disabled} onClick={props.onOpenImagePicker}>
        <ImageIcon />
      </ToolbarButton>
      <ToolbarButton title="插入音乐" disabled={disabled} onClick={props.onOpenMusicPicker}>
        <Music2Icon />
      </ToolbarButton>
      <ToolbarButton
        title="插入表格 (3×3 含表头)"
        disabled={disabled}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </ToolbarButton>
      <Popover
        open={linkToolbarOpen}
        onOpenChange={(open) => {
          if (open) {
            editor.chain().focus().run()
          }
          setLinkToolbarOpen(open)
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant={editor.isActive('link') ? 'secondary' : 'ghost'}
              size="sm"
              disabled={disabled}
              title="链接"
              aria-label="链接"
              aria-pressed={editor.isActive('link')}
              onMouseDownCapture={(event) => {
                // Match BubbleMenu / LinkPopover: keep ProseMirror selection
                // when the trigger is pressed so setLink still has a range.
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
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <MinusIcon />
      </ToolbarButton>
    </>
  )

  const groups = (
    <>
      {density === 'full' ? <UndoRedoGroup editor={editor} disabled={disabled} /> : null}
      <BlockStyleGroup editor={editor} disabled={disabled} density={density} />
      <AlignGroup editor={editor} disabled={disabled} density={density} />
      <ToolbarGroup>
        <ToolbarButton
          title="加粗 (Cmd/Ctrl+B)"
          disabled={disabled}
          state={editor.isActive('bold') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          title="斜体 (Cmd/Ctrl+I)"
          disabled={disabled}
          state={editor.isActive('italic') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton
          title="下划线 (Cmd/Ctrl+U)"
          disabled={disabled}
          state={editor.isActive('underline') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          title="删除线"
          disabled={disabled}
          state={editor.isActive('strike') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </ToolbarButton>
        <ToolbarButton
          title="行内代码"
          disabled={disabled}
          state={editor.isActive('code') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code2Icon />
        </ToolbarButton>
        <ToolbarButton
          title="脚注引用（^ 空格快捷插入；行内上标；表格与代码块内不可用）"
          disabled={disabled || !canInsertFootnoteMark(editor)}
          onClick={() => props.onOpenFootnoteInsertDialog()}
        >
          <SuperscriptIcon />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton
          title="无序列表"
          disabled={disabled}
          state={editor.isActive('bulletList') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton
          title="有序列表"
          disabled={disabled}
          state={editor.isActive('orderedList') ? 'active' : 'inactive'}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </ToolbarButton>
      </ToolbarGroup>
      <InsertsGroup density={density} disabled={disabled}>
        {insertButtons}
      </InsertsGroup>
    </>
  )

  // The density toggle is the operator's runtime knob between
  // `'full'` (icon-button matrix) and `'compact'` (Select + Popover);
  // on `<sm` we already pin density to `'full'` (see
  // `useMobileToolbar`), so the toggle is hidden there to avoid
  // surfacing a control that would be silently overridden.
  const densityRail = isMobile ? null : (
    <DensityToggleButton density={props.density} onChange={props.onDensityChange} disabled={disabled} />
  )

  const isCompact = density === 'compact'

  return (
    <div
      className={cn(
        'flex w-full max-w-full min-w-0 items-center gap-x-0.5 border-b p-2',
        // On `<sm` the toolbar is a single-row, horizontally-scrollable
        // strip even in full density — otherwise the ~25 icon buttons
        // would wrap to several rows and balloon the floating pill's
        // height past the FAB row.
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
  /**
   * Set on the last group in the toolbar so we don't print a
   * dangling separator at the right edge. Internal groups always
   * print their own trailing separator — that separator stays
   * inside the group's `flex-nowrap` box, so wrapping occurs
   * BETWEEN groups (between separator and next group), never
   * leaving a separator marooned at row start or row end.
   */
  hideTrailingSeparator?: boolean
  /**
   * Extra classes — used by the Toolbar to flip a group between
   * inline (`flex`) and hidden (`hidden`) variants for the
   * full / compact density swap. The default `flex` is overridden
   * if the caller provides `flex` or `hidden` of their own.
   */
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
  editor: Editor
  disabled?: boolean
}

interface DensityGroupProps extends GroupProps {
  density: ToolbarDensity
}

function UndoRedoGroup({ editor, disabled }: GroupProps) {
  return (
    <ToolbarGroup>
      <ToolbarButton
        title="撤销 (Cmd/Ctrl+Z)"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2Icon />
      </ToolbarButton>
      <ToolbarButton
        title="重做 (Cmd/Ctrl+Shift+Z)"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2Icon />
      </ToolbarButton>
    </ToolbarGroup>
  )
}

function BlockStyleGroup({ editor, disabled, density }: DensityGroupProps) {
  return (
    <ToolbarGroup>
      {density === 'full' ? (
        <BlockStyleButtons editor={editor} disabled={disabled} />
      ) : (
        <BlockStyleSelect editor={editor} disabled={disabled} />
      )}
    </ToolbarGroup>
  )
}

function AlignGroup({ editor, disabled, density }: DensityGroupProps) {
  if (density === 'compact') {
    return (
      <ToolbarGroup>
        <AlignSelect editor={editor} disabled={disabled} />
      </ToolbarGroup>
    )
  }
  return (
    <ToolbarGroup>
      <ToolbarButton
        title="居左"
        disabled={disabled}
        state={editor.isActive({ textAlign: 'left' }) ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <AlignLeftIcon />
      </ToolbarButton>
      <ToolbarButton
        title="居中"
        disabled={disabled}
        state={editor.isActive({ textAlign: 'center' }) ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <AlignCenterIcon />
      </ToolbarButton>
      <ToolbarButton
        title="居右"
        disabled={disabled}
        state={editor.isActive({ textAlign: 'right' }) ? 'active' : 'inactive'}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
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

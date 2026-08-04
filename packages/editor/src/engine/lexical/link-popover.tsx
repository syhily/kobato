import type { LexicalEditor } from 'lexical'

import { Button } from '@kobato/editor/engine/components/button'
import { Checkbox } from '@kobato/editor/engine/components/checkbox'
import { Input } from '@kobato/editor/engine/components/input'
import { Label } from '@kobato/editor/engine/components/label'
import { TOGGLE_LINK_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { $isLinkNode } from '@lexical/link'
import { $getSelection, $isRangeSelection } from 'lexical'
import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * Lexical port of the tiptap `LinkPopover` — same two variants:
 * `toolbar` inserts linked text at the caret (显示文字 + 链接地址), `selection`
 * applies the URL to the current range (with 移除 for existing links).
 * Apply happens through `TOGGLE_LINK_COMMAND`, so both the toolbar and
 * the selection bubble share one implementation.
 */

export type LinkPopoverVariant = 'selection' | 'toolbar'

export interface LinkPopoverProps {
  editor: LexicalEditor
  variant: LinkPopoverVariant
  onClose: () => void
}

function isNewTabTarget(target: string | null | undefined): boolean {
  return target === '_blank'
}

/** The URL of the link at the collapsed caret, if any (selection-variant seed). */
function linkUrlAtCaret(editor: LexicalEditor): string {
  let href = ''
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return
    }
    const node = selection.anchor.getNode()
    const parent = node.getParent()
    if ($isLinkNode(parent)) {
      href = parent.getURL()
    }
  })
  return href
}

export function LinkPopover({ editor, variant, onClose }: LinkPopoverProps) {
  const initialHref = variant === 'selection' ? linkUrlAtCaret(editor) : ''
  const initialNewTab = isNewTabTarget(initialHref === '' ? null : initialHref)

  const [linkText, setLinkText] = useState('')
  const [href, setHref] = useState(initialHref)
  const [openInNewTab, setOpenInNewTab] = useState(
    variant === 'toolbar' ? false : initialHref === '' ? false : initialNewTab,
  )

  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const newTabFieldId = useId()

  useEffect(() => {
    firstFieldRef.current?.focus()
    firstFieldRef.current?.select()
  }, [variant])

  const apply = () => {
    if (variant === 'toolbar') {
      const text = linkText.trim()
      const url = href.trim()
      if (text === '' || url === '') {
        return
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url, text, openInNewTab })
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: href.trim(), openInNewTab })
    }
    onClose()
  }

  const removeLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: '', openInNewTab: false })
    onClose()
  }

  const onSubmit = () => {
    apply()
  }

  const showRemove = variant === 'selection' && initialHref !== ''

  return (
    <div
      className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border bg-popover p-3 text-sm shadow-md"
      onMouseDown={(event) => {
        event.preventDefault()
      }}
    >
      {variant === 'toolbar' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="link-popover-text">
              显示文字
            </Label>
            <Input
              ref={firstFieldRef}
              id="link-popover-text"
              type="text"
              value={linkText}
              placeholder="链接显示的文字"
              onChange={(event) => setLinkText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="link-popover-href-toolbar">
              链接地址
            </Label>
            <Input
              id="link-popover-href-toolbar"
              type="url"
              inputMode="url"
              value={href}
              placeholder="https://"
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="link-popover-href-selection">
            链接地址
          </Label>
          <Input
            ref={firstFieldRef}
            id="link-popover-href-selection"
            type="url"
            inputMode="url"
            value={href}
            placeholder="https://"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              }
            }}
          />
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-xs" htmlFor={newTabFieldId}>
        <Checkbox
          id={newTabFieldId}
          checked={openInNewTab}
          onCheckedChange={(value) => {
            setOpenInNewTab(value === true)
          }}
        />
        <span>在新标签页中打开</span>
      </label>

      <div className="flex flex-wrap justify-end gap-1">
        {showRemove ? (
          <Button variant="ghost" size="sm" type="button" onClick={removeLink} title="移除链接">
            <Trash2Icon /> 移除
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" type="button" onClick={onClose} title="取消">
          <XIcon /> 取消
        </Button>
        <Button size="sm" type="button" onClick={onSubmit} title={variant === 'toolbar' ? '插入' : '应用'}>
          <CheckIcon /> {variant === 'toolbar' ? '插入' : '应用'}
        </Button>
      </div>
    </div>
  )
}

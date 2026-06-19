import type { LexicalEditor } from 'lexical'

import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $getSelection, $isRangeSelection } from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'

interface LinkPopoverProps {
  editor: LexicalEditor
  onClose: () => void
}

function getExistingLink(editor: LexicalEditor): { url: string; text: string } | null {
  let result: { url: string; text: string } | null = null
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      return
    }
    const nodes = selection.getNodes()
    for (const node of nodes) {
      const parent = node.getParent()
      if ($isLinkNode(parent)) {
        result = { url: parent.getURL(), text: selection.getTextContent() }
        return
      }
    }
  })
  return result
}

export function LinkPopover({ editor, onClose }: LinkPopoverProps) {
  const existing = getExistingLink(editor)
  const [url, setUrl] = useState(existing?.url ?? '')
  const [text, setText] = useState(existing?.text ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const apply = useCallback(() => {
    if (url.length > 0) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url, target: '_blank', rel: 'noopener noreferrer nofollow' })
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null) // remove link
    }
    onClose()
  }, [editor, url, onClose])

  const remove = useCallback(() => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    onClose()
  }, [editor, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        apply()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [apply, onClose],
  )

  return (
    <div className="inkling-link-popover absolute z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        {existing !== null ? '编辑链接' : '插入链接'}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://..."
        className="mb-2 w-full rounded border bg-background px-2 py-1 text-sm"
      />
      {existing === null ? (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="链接文字（可选）"
          className="mb-2 w-full rounded border bg-background px-2 py-1 text-sm"
        />
      ) : null}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={apply}
          className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
        >
          {existing !== null ? '更新' : '插入'}
        </button>
        {existing !== null ? (
          <button
            type="button"
            onClick={remove}
            className="rounded border bg-background px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            移除
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          取消
        </button>
      </div>
    </div>
  )
}

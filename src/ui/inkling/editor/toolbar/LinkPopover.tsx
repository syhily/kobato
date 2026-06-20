import type { LexicalEditor } from 'lexical'

import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $getSelection, $isRangeSelection } from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { isSafeUrl } from '@/shared/sanitize-url'
import { readEditor } from '@/ui/inkling/editor/shared/read-editor'

interface LinkPopoverProps {
  editor: LexicalEditor
  onClose: () => void
}

function getExistingLink(editor: LexicalEditor): { url: string; text: string } | null {
  return readEditor(editor, () => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      return null
    }
    const nodes = selection.getNodes()
    for (const node of nodes) {
      const parent = node.getParent()
      if ($isLinkNode(parent)) {
        return { url: parent.getURL(), text: selection.getTextContent() }
      }
    }
    return null
  })
}

export function LinkPopover({ editor, onClose }: LinkPopoverProps) {
  // Read the existing link once for this popover's lifetime. The popover is
  // mounted for a single link-editing session, so memoising on `[]` avoids
  // a full editor-state read on every keystroke in the URL input.
  const existing = useMemo(() => getExistingLink(editor), [editor])
  const [url, setUrl] = useState(existing?.url ?? '')
  const [text, setText] = useState(existing?.text ?? '')
  const [urlError, setUrlError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const apply = useCallback(() => {
    const trimmed = url.trim()
    // Perimeter guard: reject unsafe schemes before they reach Lexical.
    // Lexical 0.45's `LinkNode.sanitizeUrl` only cleans the URL at DOM
    // export time, so `exportJSON` would persist the raw `javascript:`
    // string into the Inkling document and through to the DB. Renderers
    // re-sanitize on output, but persisting the unsafe URL lets it leak
    // through any future consumer that forgets the second layer.
    if (trimmed.length > 0 && !isSafeUrl(trimmed)) {
      setUrlError('链接协议不被允许（仅支持 http/https/mailto/tel 或相对路径）。')
      return
    }
    setUrlError(null)
    if (trimmed.length > 0) {
      // When creating a new link with explicit text, seed the selection's
      // text content first so the link carries the typed label rather than
      // whatever was (or wasn't) selected. For an existing link we leave
      // the text untouched — editing the URL shouldn't clobber the visible
      // label the user already has.
      if (existing === null && text.trim().length > 0) {
        editor.update(
          () => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              selection.insertText(text)
            }
          },
          { tag: 'history-merge' },
        )
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
        url: trimmed,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      })
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null) // remove link
    }
    onClose()
  }, [editor, url, text, existing, onClose])

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
        onChange={(e) => {
          setUrl(e.target.value)
          if (urlError !== null) {
            setUrlError(null)
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder="https://..."
        aria-invalid={urlError !== null}
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
      {urlError !== null ? (
        <div role="alert" className="mb-2 text-xs text-destructive">
          {urlError}
        </div>
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

import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { InklingFeatureMode } from '@/shared/inkling/schema'
import type { InklingCardMenuItem } from '@/ui/inkling/editor/cards/card-registry'

import { buildInklingCardMenu } from '@/ui/inkling/editor/cards/card-registry'
import { getSelectionRect } from '@/ui/inkling/editor/shared/dom-selection'
import { cn } from '@/ui/lib/cn'

interface InklingSlashMenuProps {
  mode: InklingFeatureMode
  className?: string
}

export function useInklingSlashMenu(editor: LexicalEditor | null, mode: InklingFeatureMode) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(() => buildInklingCardMenu(mode), [mode])

  const filteredItems = useMemo(() => {
    if (query.length === 0) {
      return sections
    }
    const q = query.toLowerCase()
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [sections, query])

  const allFiltered = useMemo(() => filteredItems.flatMap((s) => s.items), [filteredItems])

  const selectedItem = allFiltered[selectedIndex] ?? null

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
    setPosition(null)
  }, [])

  const insert = useCallback(
    (item: InklingCardMenuItem) => {
      if (editor === null) {
        return
      }
      // Remove the `/query` trigger text in its own update, then run the
      // card insert handler in a second update. `item.insert` calls
      // `insertBlockCard`, which owns its own `editor.update` (with a
      // `history-merge` tag). We must NOT nest it inside another update —
      // Lexical silently drops re-entrant updates that carry a tag.
      // Both updates use `history-merge` so they collapse into a single
      // undo entry.
      editor.update(
        () => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return
          }
          const anchor = selection.anchor
          const node = anchor.getNode()
          if ($isTextNode(node)) {
            const text = node.getTextContent()
            const before = text.slice(0, anchor.offset)
            const slashIndex = before.lastIndexOf('/')
            if (slashIndex !== -1) {
              node.spliceText(slashIndex, anchor.offset - slashIndex, '')
              node.select(slashIndex, slashIndex)
            }
          }
        },
        { tag: 'history-merge' },
      )
      item.insert(editor)
      close()
    },
    [editor, close],
  )

  // Listen for text input to detect "/" and track the query that follows it.
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return editor.registerUpdateListener(({ editorState }) => {
      // IME guard: during CJK composition the editor emits intermediate
      // state updates that can pass through `/` (e.g. a pinyin candidate
      // selection, or an IME that inserts `/` as a dead-key artifact).
      // Acting on those would pop the slash menu mid-composition and
      // disrupt input. Mirrors the guard in `FloatingFormatToolbar`.
      if (editor.isComposing()) {
        return
      }
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          if (open) {
            close()
          }
          return
        }
        const anchor = selection.anchor
        const node = anchor.getNode()
        const text = $isTextNode(node) ? node.getTextContent() : ''
        const before = text.slice(0, anchor.offset)
        const slashIndex = before.lastIndexOf('/')
        if (slashIndex === -1) {
          if (open) {
            close()
          }
          return
        }
        const queryText = before.slice(slashIndex + 1)
        // Close the menu once the user leaves the slash-command word (e.g. types a space).
        if (/\s/.test(queryText)) {
          if (open) {
            close()
          }
          return
        }

        const rootEl = editor.getRootElement()
        if (rootEl !== null) {
          const rect = getSelectionRect(rootEl)
          if (rect !== null) {
            setPosition({ top: rect.bottom + 4, left: rect.left })
          }
        }
        if (!open) {
          setOpen(true)
        }
        // Reset the highlighted item whenever the query changes so the
        // selection never points past the end of the filtered list
        // (e.g. user was on item 3 and typed a filter that yields 2
        // items — without this `selectedItem` would be null and Enter
        // would silently no-op until an arrow key is pressed).
        setSelectedIndex(0)
        setQuery(queryText)
      })
    })
  }, [editor, open, close])

  // Keyboard navigation
  useEffect(() => {
    if (editor === null || !open) {
      return undefined
    }
    return editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        event.preventDefault()
        // Wrap around at the bottom so ArrowDown from the last item jumps to
        // the first — matches Koenig's circular navigation.
        setSelectedIndex((i) => (i + 1) % Math.max(allFiltered.length, 1))
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, open, allFiltered])

  useEffect(() => {
    if (editor === null || !open) {
      return undefined
    }
    return editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event: KeyboardEvent) => {
        event.preventDefault()
        // Wrap around at the top so ArrowUp from the first item jumps to the
        // last.
        setSelectedIndex((i) => (i - 1 + allFiltered.length) % Math.max(allFiltered.length, 1))
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, open, allFiltered])

  useEffect(() => {
    if (editor === null || !open) {
      return undefined
    }
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent) => {
        if (selectedItem === null) {
          return false
        }
        event.preventDefault()
        insert(selectedItem)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, open, selectedItem, insert])

  useEffect(() => {
    if (editor === null || !open) {
      return undefined
    }
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        // Remove the `/query` trigger text before closing so the user isn't
        // left with stray `/code` in their document. Matches Koenig's Escape
        // behaviour which restores the caret to a clean state.
        editor.update(
          () => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
              return
            }
            const anchor = selection.anchor
            const node = anchor.getNode()
            if (!$isTextNode(node)) {
              return
            }
            const text = node.getTextContent()
            const before = text.slice(0, anchor.offset)
            const slashIndex = before.lastIndexOf('/')
            if (slashIndex !== -1) {
              node.spliceText(slashIndex, anchor.offset - slashIndex, '')
              node.select(slashIndex, slashIndex)
            }
          },
          { tag: 'history-merge', discrete: true },
        )
        close()
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, open, close])

  // Click outside to close
  useEffect(() => {
    if (!open) {
      return undefined
    }
    const handler = (e: MouseEvent) => {
      if (menuRef.current !== null && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  const SlashMenuComponent = useCallback(() => {
    if (!open || position === null) {
      return null
    }
    return (
      <div
        ref={menuRef}
        className="inkling-slash-menu absolute z-50 max-h-72 w-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
        style={{ top: position.top, left: position.left }}
      >
        {query.length > 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">搜索: {query}</div> : null}
        {filteredItems.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">无匹配结果</div>
        ) : (
          filteredItems.map((section) => (
            <div key={section.section}>
              <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase">
                {section.label}
              </div>
              {section.items.map((item) => {
                const globalIdx = allFiltered.indexOf(item)
                const isSelected = globalIdx === selectedIndex
                const Icon = item.icon
                return (
                  <button
                    key={item.type}
                    type="button"
                    aria-label={item.label}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition',
                      isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      insert(item)
                    }}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex flex-col">
                      <span className="text-sm leading-tight font-medium">{item.label}</span>
                      <span
                        className={cn(
                          'text-[11px] leading-tight',
                          isSelected ? 'text-accent-foreground/70' : 'text-muted-foreground',
                        )}
                      >
                        {item.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    )
  }, [open, position, query, filteredItems, allFiltered, selectedIndex, insert])

  return { SlashMenuComponent, open }
}

/** Mountable plugin component. */
export function InklingSlashMenuPlugin({ mode, className: _className }: InklingSlashMenuProps) {
  const [editor] = useLexicalComposerContext()
  const { SlashMenuComponent } = useInklingSlashMenu(editor, mode)
  return <SlashMenuComponent />
}

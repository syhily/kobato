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
import type { InklingCardMenuItem, InklingCardMenuSection } from '@/ui/inkling/editor/cards/card-registry'

import { buildInklingCardMenu } from '@/ui/inkling/editor/cards/card-registry'
import { getSelectionRect } from '@/ui/inkling/editor/shared/dom-selection'

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
            const nextTop = rect.bottom + 4
            const nextLeft = rect.left
            // Only update position when it actually moves. The update
            // listener fires on every editor commit (including arrow-key
            // menu navigation that doesn't move the caret), and a new
            // position object — even with identical values — re-renders
            // the menu and can reset its scroll offset.
            setPosition((prev) => {
              if (prev !== null && prev.top === nextTop && prev.left === nextLeft) {
                return prev
              }
              return { top: nextTop, left: nextLeft }
            })
          }
        }
        if (!open) {
          setOpen(true)
        }
        // Reset the highlighted item ONLY when the query actually changes.
        // The update listener fires on every editor commit — including
        // arrow-key navigation that doesn't touch the text — so resetting
        // unconditionally would snap the selection back to the top every
        // time the user arrows down the menu. Comparing against the current
        // query state keeps the reset tied to real text edits.
        setQuery((prevQuery) => {
          if (prevQuery !== queryText) {
            setSelectedIndex(0)
          }
          return queryText
        })
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

  // The menu DOM is rendered by the stable <SlashMenuView> component below
  // — NOT by a useCallback-wrapped inline component. Returning a fresh
  // function component from the hook and rendering it as <Comp/> causes
  // React to unmount+remount the menu whenever any dep changes (e.g.
  // selectedIndex on mouseenter), which destroys scrollTop and snaps the
  // list back to the top. A module-level component with a stable identity
  // preserves the DOM node across re-renders.
  const menuElement =
    !open || position === null ? null : (
      <SlashMenuView
        menuRef={menuRef}
        position={position}
        query={query}
        sections={filteredItems}
        allItems={allFiltered}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onInsert={insert}
      />
    )

  return { menuElement, open }
}

interface SlashMenuViewProps {
  menuRef: React.RefObject<HTMLDivElement | null>
  position: { top: number; left: number }
  query: string
  sections: InklingCardMenuSection[]
  allItems: InklingCardMenuItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  onInsert: (item: InklingCardMenuItem) => void
}

/**
 * Stable, module-level menu component. Its identity never changes across
 * re-renders, so React updates the DOM in place instead of
 * unmounting/remounting — preserving the scroll position when the user
 * hovers items or navigates with arrow keys.
 */
function SlashMenuView({
  menuRef,
  position,
  query,
  sections,
  allItems,
  selectedIndex,
  onSelect,
  onInsert,
}: SlashMenuViewProps) {
  // Keep the highlighted option scrolled into view as the user navigates
  // with arrow keys. `block: 'nearest'` only scrolls when the option is
  // actually out of view (no jitter when navigating within the visible window).
  useEffect(() => {
    if (menuRef.current === null) {
      return
    }
    const selected = menuRef.current.querySelector('[aria-selected="true"]')
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  })

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="卡片菜单"
      className="inkling-slash-menu inkling-cardmenu absolute z-50 max-h-72 overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {query.length > 0 ? <div className="inkling-cardmenu-query">搜索: {query}</div> : null}
      {sections.length === 0 ? (
        <div className="inkling-cardmenu-empty">无匹配结果</div>
      ) : (
        sections.map((section) => (
          <div key={section.section}>
            <div className="inkling-cardmenu-section">{section.label}</div>
            {section.items.map((item) => {
              const globalIdx = allItems.indexOf(item)
              const isSelected = globalIdx === selectedIndex
              const Icon = item.icon
              return (
                <button
                  key={item.type}
                  type="button"
                  role="option"
                  aria-label={item.label}
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onInsert(item)
                  }}
                  onMouseEnter={() => onSelect(globalIdx)}
                  className="inkling-cardmenu-item"
                >
                  <span className="inkling-cardmenu-item-icon">
                    <Icon />
                  </span>
                  <span className="inkling-cardmenu-item-text">
                    <span className="inkling-cardmenu-item-title">{item.label}</span>
                    <span className="inkling-cardmenu-item-desc">{item.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

/** Mountable plugin component. */
export function InklingSlashMenuPlugin({ mode, className: _className }: InklingSlashMenuProps) {
  const [editor] = useLexicalComposerContext()
  const { menuElement } = useInklingSlashMenu(editor, mode)
  return menuElement
}

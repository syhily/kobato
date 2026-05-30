import type { Editor, Range } from '@tiptap/core'

import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'

import { filterSlashCommands, SLASH_COMMANDS, type SlashCommand } from '@/ui/admin/editor/tiptap/slash-commands'
import { cn } from '@/ui/lib/cn'

// Re-export the command shape so embedders building a custom catalogue
// (e.g. the public comment editor) can share the type without pulling
// in the admin command implementations.
export type { SlashCommand }

interface SlashCommandsExtensionOptions {
  /**
   * Catalogue to filter against. Defaults to the full admin catalogue
   * (`SLASH_COMMANDS`); pass a curated subset to scope the menu — the
   * comment editor uses this to omit image/music/table/footnote
   * commands without forking the renderer.
   */
  commands: readonly SlashCommand[]
}

// Slash command extension for Tiptap. The wiring is the standard
// `@tiptap/suggestion` pattern:
//   1. The Extension below registers a ProseMirror plugin that watches
//      for `/` followed by a query.
//   2. `render()` mounts a `ReactRenderer` whose React component is
//      `SlashMenuList` — it owns the list, keyboard navigation, and
//      hover styling. The component is a forward-ref so the
//      extension can call `.onKeyDown` from the suggestion
//      lifecycle without involving `editor.commands`.
//   3. Positioning: the suggestion plugin gives us a `clientRect()`
//      pointing at the inserted `/`. We drive a `position: fixed`
//      portal off that rect — no third-party anchor primitive
//      required, which keeps the editor bundle free of any new
//      direct dependency on a popover library. The trade-off vs.
//      `@floating-ui` is that we don't auto-flip when the menu
//      would clip the viewport; we cap height + scroll instead,
//      which matches the emdash slash menu UX and is plenty given
//      the editor canvas usually has whitespace below the cursor.
//
// The component lives in this file (not split into a sibling) because
// it would otherwise need a barrel re-export to make the suggestion
// plugin reach it — and AGENTS.md's `bundle-barrel-imports` rule
// forbids that. The list cap + state machine are emdash-tested.

interface SlashMenuRendererRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const SLASH_PLUGIN_NAME = 'slashSuggestion'

export const SlashCommandsExtension = Extension.create<SlashCommandsExtensionOptions>({
  name: SLASH_PLUGIN_NAME,
  addOptions() {
    return { commands: SLASH_COMMANDS }
  },
  addProseMirrorPlugins() {
    const catalogue = this.options.commands
    return [
      Suggestion<SlashCommand>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => [...filterSlashCommands(query, catalogue)],
        command: ({ editor, range, props }) => {
          // Suggestion's `command` runs the user's chosen slash
          // command. Each entry in `slash-commands.ts` is responsible
          // for any range-deletion / focus juggling.
          props.command({ editor, range })
        },
        render: () => {
          let component: ReactRenderer<SlashMenuRendererRef, SlashMenuListProps> | null = null

          return {
            onStart: (props) => {
              component = new ReactRenderer<SlashMenuRendererRef, SlashMenuListProps>(SlashMenuList, {
                editor: props.editor,
                props: toListProps(props),
              })
            },
            onUpdate: (props) => {
              component?.updateProps(toListProps(props))
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                component?.updateProps({
                  ...(component.props as SlashMenuListProps),
                  isOpen: false,
                })
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})

interface SlashMenuListProps {
  items: readonly SlashCommand[]
  command: (item: SlashCommand) => void
  clientRect?: (() => DOMRect | null) | null
  query: string
  editor: Editor
  range: Range
  isOpen?: boolean
  ref?: Ref<SlashMenuRendererRef>
}

function toListProps(suggestion: SuggestionProps<SlashCommand>): SlashMenuListProps {
  return {
    items: suggestion.items,
    command: (item) => suggestion.command(item),
    clientRect: suggestion.clientRect,
    query: suggestion.query,
    editor: suggestion.editor,
    range: suggestion.range,
    isOpen: true,
  }
}

function SlashMenuList(props: SlashMenuListProps) {
  const { items, command, clientRect, query, isOpen = true, ref } = props
  const [activeIndex, setActiveIndex] = useState(0)
  const itemsRef = useRef<readonly SlashCommand[]>(items)
  const activeIndexRef = useRef(activeIndex)
  itemsRef.current = items
  activeIndexRef.current = activeIndex
  // Reset the active highlight whenever the filtered list shrinks
  // out from under it — emdash hit a re-render loop here, the fix
  // is to track items + active idx in refs and only commit through
  // setState when the user navigates.
  useEffect(() => {
    if (activeIndex >= items.length && items.length > 0) {
      setActiveIndex(0)
    }
  }, [items, activeIndex])

  // Track the anchor rect so the menu follows the cursor as the user
  // types more characters. `clientRect()` queries layout (a layout
  // read forces a flush on Chromium). We read it inside useLayoutEffect
  // so the measurement happens after paint but before the browser
  // commits the next frame, avoiding a layout read during render.
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    setRect(clientRect ? clientRect() : null)
  }, [clientRect, query])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!isOpen) {
        return false
      }
      const list = itemsRef.current
      if (event.key === 'ArrowDown') {
        if (list.length === 0) {
          return true
        }
        setActiveIndex((current) => (current + 1) % list.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        if (list.length === 0) {
          return true
        }
        setActiveIndex((current) => (current - 1 + list.length) % list.length)
        return true
      }
      if (event.key === 'Enter') {
        const item = list[activeIndexRef.current]
        if (item !== undefined) {
          command(item)
        }
        return true
      }
      return false
    },
  }))

  if (!isOpen || rect === null || typeof document === 'undefined') {
    return null
  }
  if (items.length === 0) {
    return createPortal(
      <div
        // Combobox-style suggestion popup, not a form select. The
        // <select> alternative the lint rule suggests has incompatible
        // keyboard model and can't be styled this way.
        role="listbox"
        className="fixed z-[1600] w-72 rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md"
        style={positionStyle(rect)}
      >
        没有匹配的命令
      </div>,
      document.body,
    )
  }
  return createPortal(
    <div
      role="listbox"
      aria-label="斜杠命令菜单"
      className="fixed z-[1600] flex max-h-72 w-72 flex-col gap-0.5 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
      style={positionStyle(rect)}
    >
      {items.map((item, index) => {
        const Icon = item.icon
        const active = index === activeIndex
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.title}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              command(item)
            }}
            className={cn(
              'flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-left transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-foreground',
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex flex-col">
              <span className="font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

// Anchor the menu just below the suggestion `/` glyph. We cap left
// at viewport edge - 320px so the menu can't render off-screen when
// the user types `/` in the right margin of a wide layout. Vertical
// offset matches the line-height of body copy so the menu doesn't
// crowd the cursor.
function positionStyle(rect: DOMRect): React.CSSProperties {
  const margin = 8
  const menuWidth = 288
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin))
  const top = rect.bottom + 6
  return { top, left }
}

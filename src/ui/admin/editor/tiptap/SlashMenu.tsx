import type { Editor, Range } from '@tiptap/core'

import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'

import { filterSlashCommands, SLASH_COMMANDS, type SlashCommand } from '@/ui/admin/editor/tiptap/slash-commands'
import { cn } from '@/ui/lib/cn'

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
  useEffect(() => {
    if (activeIndex >= items.length && items.length > 0) {
      setActiveIndex(0)
    }
  }, [items, activeIndex])

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
        role="listbox"
        className="fixed z-[1600] w-72 rounded-xl border bg-popover p-2 text-sm text-muted-foreground shadow-md"
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
      className="fixed z-[1600] flex max-h-72 w-72 flex-col gap-0.5 overflow-y-auto rounded-xl border bg-popover p-1 text-sm shadow-md"
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

function positionStyle(rect: DOMRect): React.CSSProperties {
  const margin = 8
  const menuWidth = 288
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin))
  const top = rect.bottom + 6
  return { top, left }
}

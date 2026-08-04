import type { ElementNode, TextNode } from 'lexical'

import {
  LEXICAL_SLASH_COMMANDS,
  filterLexicalSlashCommands,
  type LexicalSlashCommand,
} from '@kobato/editor/engine/lexical/slash-commands'
import { cn } from '@kobato/editor/lib/cn'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Slash menu for the Lexical engine — the port of the tiptap
 * `SlashCommandsExtension` + `SlashMenuList`. Built on the 0.45
 * `LexicalTypeaheadMenuPlugin`:
 *
 *   - trigger: `/` immediately (minLength 0), query characters exclude
 *     whitespace / punctuation / `/` — same feel as tiptap's
 *     `allowSpaces: false`
 *   - keyboard: the plugin owns ArrowUp/Down, Enter/Tab select, Escape
 *     close; the list mirrors the tiptap visuals (portal, w-72,
 *     role=listbox, active row accent)
 *   - select: the plugin splits the `/query` text into its own node
 *     (`shouldSplitNodeWithQuery`), we remove it, restore the caret at
 *     the deletion point and run the command's `insert` — formatting
 *     lands on the paragraph under the caret, block inserts use
 *     `$insertNodeToNearestRoot`
 *
 * The catalogue defaults to the full admin set; a curated subset can be
 * passed (comment-editor parity with the tiptap `commands` option).
 */

class SlashMenuOption extends MenuOption {
  command: LexicalSlashCommand

  constructor(command: LexicalSlashCommand) {
    super(command.id)
    this.command = command
  }
}

export interface LexicalSlashMenuPluginProps {
  /** Catalogue to filter against; defaults to `LEXICAL_SLASH_COMMANDS`. */
  commands?: readonly LexicalSlashCommand[]
}

export function LexicalSlashMenuPlugin({ commands }: LexicalSlashMenuPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)

  const options = useMemo(() => {
    const catalogue = commands ?? LEXICAL_SLASH_COMMANDS
    return filterLexicalSlashCommands(query ?? '', catalogue).map((command) => new SlashMenuOption(command))
  }, [commands, query])

  const triggerFn = useBasicTypeaheadTriggerMatch('/', { minLength: 0 })

  const handleSelect = (option: SlashMenuOption, textNodeContainingQuery: TextNode | null, closeMenu: () => void) => {
    // Runs inside the plugin's editor update — remove the `/query` text
    // node and park the caret at the deletion point, then run the command.
    let anchor: ElementNode | null = null
    let offset = 0
    if (textNodeContainingQuery !== null) {
      anchor = textNodeContainingQuery.getParent()
      offset = textNodeContainingQuery.getIndexWithinParent()
      textNodeContainingQuery.remove()
    }
    if (anchor !== null) {
      anchor.select(offset, offset)
    }
    option.command.insert(editor)
    closeMenu()
  }

  return (
    <LexicalTypeaheadMenuPlugin<SlashMenuOption>
      options={options}
      onQueryChange={setQuery}
      onSelectOption={handleSelect}
      triggerFn={triggerFn}
      preselectFirstItem
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options: menuOptions },
      ) => {
        const anchor = anchorElementRef.current
        if (anchor === null || typeof document === 'undefined') {
          return null
        }
        const rect = anchor.getBoundingClientRect()
        if (menuOptions.length === 0) {
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
            {menuOptions.map((option, index) => {
              const command = option.command
              const Icon = command.icon
              const active = index === selectedIndex
              return (
                <button
                  key={option.key}
                  type="button"
                  ref={(element) => {
                    if (element !== null) {
                      option.setRefElement(element)
                    }
                  }}
                  aria-label={command.title}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectOptionAndCleanUp(option)
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-left transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex flex-col">
                    <span className="font-medium">{command.title}</span>
                    <span className="text-xs text-muted-foreground">{command.description}</span>
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )
      }}
    />
  )
}

function positionStyle(rect: DOMRect): React.CSSProperties {
  const margin = 8
  const menuWidth = 288
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin))
  const top = rect.bottom + 6
  return { top, left }
}

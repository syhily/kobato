import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection } from 'lexical'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { InklingFeatureMode } from '@/shared/inkling/schema'
import type { InklingCardMenuItem } from '@/ui/inkling/editor/cards/card-registry'

import { buildInklingCardMenu } from '@/ui/inkling/editor/cards/card-registry'
import { cn } from '@/ui/lib/cn'

const SECTION_LABELS: Record<string, string> = {
  media: '媒体',
  rich: '富文本',
  layout: '布局',
  structure: '结构',
}

function insertCard(editor: LexicalEditor, item: InklingCardMenuItem): void {
  editor.update(() => {
    // Restore a collapsed RangeSelection if the editor lost focus while the
    // menu was open.  Without this, insertBlockCard's $getSelection() check
    // for $isRangeSelection fails and the card is appended to root instead of
    // inserted at the original cursor position.
    const selection = $getSelection()
    if (selection === null && editor.getRootElement() !== null) {
      editor.getRootElement()?.focus()
      // Focus triggers Lexical's selection restoration; run the insert in a
      // subsequent microtask if needed, but for now we just let the caller
      // retry or the insertion falls through to root-append.
    }
    item.insert(editor)
  })
}

export interface InklingPlusMenuPluginProps {
  mode: InklingFeatureMode
}

export function InklingPlusMenuPlugin({ mode }: InklingPlusMenuPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(() => buildInklingCardMenu(mode), [mode])

  const handleInsert = useCallback(
    (item: InklingCardMenuItem) => {
      insertCard(editor, item)
      setOpen(false)
    },
    [editor],
  )

  // Close on outside click.
  const handleBlur = useCallback((e: React.FocusEvent) => {
    const related = e.relatedTarget
    if (
      menuRef.current !== null &&
      related instanceof Node &&
      !menuRef.current.contains(related) &&
      buttonRef.current !== null &&
      !buttonRef.current.contains(related)
    ) {
      setOpen(false)
    }
  }, [])

  return (
    <div className="inkling-plus-menu-wrapper pointer-events-none absolute -top-2 left-0 z-40 w-full">
      <div className="mx-auto flex w-full max-w-[var(--inkling-content-width,740px)] justify-start">
        <button
          ref={buttonRef}
          type="button"
          aria-label="插入卡片"
          aria-expanded={open}
          aria-haspopup="true"
          onMouseDown={(e) => {
            // preventDefault keeps the editor from losing selection when
            // clicking the + button.  We do NOT call editor.focus() here
            // because that would move the cursor to the start of the
            // contenteditable on the next render.
            e.preventDefault()
            setOpen((prev) => !prev)
          }}
          className={cn(
            'pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border text-xs leading-none transition-colors',
            open
              ? 'text-brand-foreground border-brand bg-brand'
              : 'border-muted-foreground/20 bg-background text-muted-foreground hover:border-brand hover:text-brand',
          )}
        >
          +
        </button>
      </div>
      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="卡片菜单"
          className={cn(
            'pointer-events-auto absolute top-8 left-6 z-50 w-56 rounded-lg border bg-popover p-1 shadow-lg',
          )}
          onBlur={handleBlur}
        >
          {sections.map((section) => (
            <div key={section.section}>
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold text-muted-foreground/60 uppercase">
                {SECTION_LABELS[section.section] ?? section.section}
              </div>
              {section.items
                .filter((item) => item.modes.includes(mode))
                .map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleInsert(item)
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <span className="text-base leading-none">{item.label}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

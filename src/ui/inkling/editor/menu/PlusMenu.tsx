import type { LexicalEditor, LexicalNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, $isTextNode, SELECTION_CHANGE_COMMAND } from 'lexical'
import { PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { InklingFeatureMode } from '@/shared/inkling/schema'
import type { InklingCardMenuItem } from '@/ui/inkling/editor/cards/card-registry'

import { buildInklingCardMenu } from '@/ui/inkling/editor/cards/card-registry'
import { readEditor } from '@/ui/inkling/editor/shared/read-editor'
import { cn } from '@/ui/lib/cn'

const SECTION_LABELS: Record<string, string> = {
  media: '媒体',
  rich: '富文本',
  layout: '布局',
  structure: '结构',
}

/**
 * Horizontal gap between the `+` button and the paragraph's left text edge.
 * Mirrors Koenig's card-add gutter — the button sits in the left margin,
 * not flush against the text. The actual offset is clamped in
 * `computePosition` so the button never overflows the editor shell (the
 * scroll container's padding is narrower than this on mobile).
 */
const PLUS_BUTTON_GUTTER = 28
/**
 * Size of the `+` button (h-6 w-6 = 24px). Used to clamp the left offset so
 * the whole button stays inside the editor shell.
 */
const PLUS_BUTTON_SIZE = 24

function insertCard(editor: LexicalEditor, item: InklingCardMenuItem): void {
  editor.update(() => {
    const selection = $getSelection()
    if (selection === null) {
      // Editor lost focus while menu was open.  Focus first, then defer
      // the insert to a subsequent update so Lexical's focus handler can
      // restore the RangeSelection at the previous cursor position.
      // Without this, insertBlockCard appends to root instead of inserting
      // at the original location.
      editor.focus(
        () => {
          editor.update(() => {
            item.insert(editor)
          })
        },
        { defaultSelection: undefined },
      )
      return
    }
    item.insert(editor)
  })
}

/**
 * Decide whether the `+` button should show for the current selection, and
 * if so return the key of the paragraph it should anchor to.
 *
 * Koenig shows the add-card button at the left margin of the paragraph the
 * caret is in, but ONLY when the caret is at the very start of that
 * paragraph — i.e. the paragraph is empty, or the caret is before all
 * text. Once the user types, the button disappears. This matches that
 * behaviour: we walk up from the anchor to the nearest top-level block,
 * and require the anchor offset to be 0 with no preceding text.
 */
function getAnchorParagraphKey(editor: LexicalEditor): string | null {
  return readEditor(editor, () => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return null
    }
    const anchor = selection.anchor
    const anchorNode = anchor.getNode()
    if (anchorNode === null) {
      return null
    }

    // Resolve the top-level block element that owns the anchor (paragraph,
    // heading, quote, list item, …). For a text node this is its parent
    // element; for an element node (e.g. empty paragraph) it is itself.
    let block: LexicalNode = anchorNode
    if ($isTextNode(anchorNode)) {
      // Caret must be at offset 0 AND no text before it inside this node.
      if (anchor.offset !== 0) {
        return null
      }
      const parent = anchorNode.getPreviousSibling()
      // Any preceding sibling (text or inline) means the caret is not at
      // the paragraph start — e.g. "ab|c" or a leading inline node.
      if (parent !== null) {
        return null
      }
      block = anchorNode.getTopLevelElement() ?? anchorNode.getParent() ?? anchorNode
    }
    // For an element anchor (empty block), offset 0 is the start.
    if (block === null) {
      return null
    }
    return block.getKey()
  })
}

export interface InklingPlusMenuPluginProps {
  mode: InklingFeatureMode
}

export function InklingPlusMenuPlugin({ mode }: InklingPlusMenuPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [open, setOpen] = useState(false)
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
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

  // Pure position computation — no setState. Kept side-effect-free so the
  // scroll/resize listeners and the anchor-change effect can all reuse it
  // without tripping the react-compiler "setState in effect body" rule.
  //
  // Coordinates are computed against the button's actual positioning
  // context — the nearest positioned ancestor (the `.inkling-editor` shell),
  // NOT the contenteditable. The button renders with `position: absolute`
  // inside `.inkling-editor`, so using the contenteditable's rect as the
  // origin would be wrong by the scroll container's padding, pushing the
  // button off-screen. We resolve the offset parent via the contenteditable
  // and measure against it.
  //
  // Returns null only when there is no anchor at all. If the anchor's DOM
  // element can't be resolved (e.g. it was just inserted and Lexical hasn't
  // reconciled yet, or in a test environment), we fall back to the offset
  // parent's origin so the button still renders.
  const computePosition = useCallback((): { top: number; left: number } | null => {
    if (anchorKey === null) {
      return null
    }
    const rootEl = editor.getRootElement()
    if (rootEl === null) {
      return { top: 0, left: 0 }
    }
    // The positioned ancestor that the absolute button will be placed in.
    // `offsetParent` walks up to the first `position: relative/absolute/…`
    // element — that is `.inkling-editor`, the button's coordinate origin.
    const origin = rootEl.offsetParent ?? rootEl
    const originRect = origin.getBoundingClientRect()

    const blockEl = editor.getElementByKey(anchorKey)
    if (blockEl === null) {
      return { top: 0, left: 0 }
    }
    const blockRect = blockEl.getBoundingClientRect()
    // The paragraph's left edge in the editor-shell coordinate space.
    const blockLeft = blockRect.left - originRect.left
    // Pull the button into the left margin by the gutter, but clamp so the
    // whole button (24px wide) stays inside the editor shell. The scroll
    // container's horizontal padding is the available margin (px-3 = 12px
    // on mobile, md:px-6 = 24px on desktop), so on mobile the gutter must
    // shrink to fit — otherwise the button overflows and gets clipped to
    // half. Never let the button start below 4px from the shell's left edge.
    const desiredLeft = blockLeft - PLUS_BUTTON_GUTTER
    const minLeft = 4
    const left = Math.max(minLeft, Math.min(desiredLeft, blockLeft - PLUS_BUTTON_SIZE - 4))
    return {
      // Vertically center on the first line. The block's top + a fraction
      // of its height lands roughly on the text baseline area.
      top: blockRect.top - originRect.top + (blockRect.height - 24) / 2,
      left,
    }
  }, [anchorKey, editor])

  // Track the caret: show/hide + re-anchor whenever the selection lands on
  // (or leaves) a paragraph start. SELECTION_CHANGE_COMMAND fires on caret
  // moves and focus changes; registerUpdateListener fires on content edits
  // (so the button hides the moment the user types into the empty block).
  useEffect(() => {
    const update = () => {
      if (editor.isComposing()) {
        return
      }
      const key = getAnchorParagraphKey(editor)
      setAnchorKey(key)
      if (key === null) {
        setOpen(false)
      }
    }
    const offSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        update()
        return false
      },
      1,
    )
    const offUpdate = editor.registerUpdateListener(update)
    return () => {
      offSelection()
      offUpdate()
    }
  }, [editor])

  // Recompute pixel position whenever the anchor changes, and on scroll /
  // resize (the paragraph may move under a scrolling container). The
  // initial recompute is deferred to a microtask so setState never runs
  // synchronously in the effect body (react-compiler rule).
  useEffect(() => {
    const handler = () => setPosition(computePosition())
    handler()
    if (anchorKey === null) {
      return undefined
    }
    window.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler)
      window.removeEventListener('resize', handler)
    }
  }, [anchorKey, computePosition])

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

  if (anchorKey === null || position === null) {
    return null
  }

  return (
    <div
      className="inkling-plus-menu-wrapper pointer-events-none absolute z-40"
      style={{ top: position.top, left: position.left }}
    >
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
          'pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
          open
            ? 'text-brand-foreground border-brand bg-brand'
            : 'border-muted-foreground/20 bg-background text-muted-foreground hover:border-brand hover:text-brand',
        )}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="卡片菜单"
          className="inkling-cardmenu pointer-events-auto absolute top-8 left-0 z-50"
          onBlur={handleBlur}
        >
          {sections.map((section) => (
            <div key={section.section}>
              <div className="inkling-cardmenu-section">{SECTION_LABELS[section.section] ?? section.section}</div>
              {section.items
                .filter((item) => item.modes.includes(mode))
                .map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.type}
                      type="button"
                      role="option"
                      aria-label={item.label}
                      aria-selected={false}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleInsert(item)
                      }}
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
          ))}
        </div>
      ) : null}
    </div>
  )
}

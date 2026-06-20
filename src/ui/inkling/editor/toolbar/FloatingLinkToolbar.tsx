import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNearestNodeFromDOMNode, $getNodeByKey } from 'lexical'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { LinkPopover } from '@/ui/inkling/editor/toolbar/LinkPopover'

/**
 * Hover link toolbar for the Inkling editor.
 *
 * When the user moves the mouse over a link in the editor (50ms debounce),
 * a compact toolbar appears above the link showing the URL and offering
 * one-click edit / remove. The toolbar hides 300ms after the mouse leaves
 * both the link and the toolbar itself.
 *
 * This mirrors Ghost Koenig's `FloatingLinkToolbar` (with the `Portal`
 * and `lodash.debounce` dependencies stripped — Inkling uses `setTimeout`
 * for debounce and `position:absolute` inside the editor container).
 */

// Reusable toolbar button matching the style of `FloatingFormatToolbar`.
function LinkToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

// Compact URL display — truncates long URLs and drops the protocol for readability.
function LinkUrlLabel({ href }: { href: string }) {
  const compact = href.replace(/^https?:\/\//, '').replace(/^www\./, '')
  return <span className="max-w-[240px] truncate text-xs text-muted-foreground">{compact}</span>
}

export function FloatingLinkToolbar(): ReactNode {
  const [editor] = useLexicalComposerContext()
  const [linkKey, setLinkKey] = useState<string | null>(null)
  const [href, setHref] = useState('')
  const [targetElem, setTargetElem] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Clear link state (shared between mouse-leave and timeout paths) ---------

  const clearLink = useCallback(() => {
    setLinkKey(null)
    setHref('')
    setTargetElem(null)
  }, [])

  // --- Mouse-move hover detection with 50ms debounce + 300ms hide delay ------

  useEffect(() => {
    const rootElement = editor.getRootElement()
    if (rootElement === null) {
      return undefined
    }

    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      // If the mouse is over the toolbar itself, cancel any pending hide
      // (prevents flicker when moving from link to toolbar).
      if (toolbarRef.current?.contains(target)) {
        if (hideTimeoutRef.current !== null) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }
        return
      }

      // Cancel any pending hide — the mouse moved, so re-evaluate.
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }

      // Clear previous hover detection timer (debounce).
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current)
      }

      // Early exit: if outside the editor root, start hide timer.
      if (!rootElement.contains(target)) {
        hideTimeoutRef.current = setTimeout(clearLink, 300)
        return
      }

      // 50ms debounce: only run detection after the mouse has been still.
      hoverTimeoutRef.current = setTimeout(() => {
        // Re-check containment — the mouse may have left during the 50ms.
        if (!rootElement.contains(target)) {
          hideTimeoutRef.current = setTimeout(clearLink, 300)
          return
        }

        try {
          editor.read(() => {
            const lexicalNode = $getNearestNodeFromDOMNode(target)
            if (lexicalNode === null) {
              hideTimeoutRef.current = setTimeout(clearLink, 300)
              return
            }
            // LinkNode is an inline ElementNode; the DOM target may be a
            // TextNode whose parent is the LinkNode.
            const link = $isLinkNode(lexicalNode) ? lexicalNode : lexicalNode.getParent()
            if (link !== null && $isLinkNode(link)) {
              // Found a link — show the toolbar.
              setLinkKey(link.getKey())
              setHref(link.getURL())
              // Resolve the DOM <a> element via Lexical's internal element
              // store (no phantom `data-lexical-link` attribute needed).
              const anchor = editor.getElementByKey(link.getKey())
              setTargetElem(anchor)
            } else {
              // Not a link — start hide delay.
              hideTimeoutRef.current = setTimeout(clearLink, 300)
            }
          })
        } catch {
          // Editor may have been destroyed between setTimeout and callback.
          // Silently ignore the stale read.
        }
      }, 50)
    }

    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current)
      }
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [editor, clearLink])

  // --- Positioning (recomputed on scroll/resize) -----------------------------

  useEffect(() => {
    if (linkKey === null || targetElem === null) {
      // Render short-circuits on `linkKey === null` before `position` is read,
      // so keeping a stale position from a previous link is harmless. Avoid
      // calling setState synchronously here to prevent cascading renders.
      return
    }
    // Guard against a detached element: if the link was removed (e.g. via
    // `handleRemove`) without the state being cleared yet, `getClientRects`
    // returns nothing and we'd keep using a stale rect. Bailing keeps the
    // positioning effect honest and lets the next hover re-arm it.
    if (!targetElem.isConnected) {
      return
    }

    const rootElement = editor.getRootElement()
    if (rootElement === null) {
      return
    }

    const computePosition = () => {
      const rootRect = rootElement.getBoundingClientRect()
      const linkRect = targetElem.getClientRects()[0]
      if (linkRect === undefined) {
        return
      }

      // Clamp the toolbar within the editor viewport: never render above
      // the top edge or below the bottom edge of the scroll container.
      const toolbarHeight = 36
      let top = linkRect.top - rootRect.top - toolbarHeight
      if (top < 0) {
        // Link is near the top — flip to below.
        top = linkRect.bottom - rootRect.top + 4
      }
      const maxTop = rootRect.height - toolbarHeight - 4
      if (top > maxTop) {
        top = maxTop
      }

      setPosition({
        top,
        left: linkRect.left - rootRect.left + linkRect.width / 2,
      })
    }

    computePosition()

    // Listen to scroll on both window (page scroll) and the editor root
    // (nested scroll container).  The editor lives inside overflow-y:auto.
    window.addEventListener('scroll', computePosition, { passive: true })
    rootElement.addEventListener('scroll', computePosition, { passive: true })
    window.addEventListener('resize', computePosition)
    return () => {
      window.removeEventListener('scroll', computePosition)
      rootElement.removeEventListener('scroll', computePosition)
      window.removeEventListener('resize', computePosition)
    }
  }, [editor, linkKey, targetElem])

  // --- Toolbar mouse-enter/leave for the 300ms hide delay --------------------

  const handleToolbarMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const handleToolbarMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(clearLink, 300)
  }, [clearLink])

  // --- Actions ---------------------------------------------------------------

  const handleEdit = useCallback(() => {
    if (linkKey === null) {
      return
    }

    // Select the link's entire content so LinkPopover sees the existing link.
    // `ElementNode.select(0, childrenSize)` creates a non-collapsed
    // RangeSelection from the start of the first child to the end of the last.
    // This is the canonical way to select all content inside an inline element.
    // (Using `node.select()` without arguments produces a collapsed selection
    // at the end, which `LinkPopover.getExistingLink` ignores.)
    editor.update(() => {
      const node = $getNodeByKey(linkKey)
      if (node === null || !$isLinkNode(node)) {
        return
      }
      node.select(0, node.getChildrenSize())
    })
    setShowLinkPopover(true)
  }, [editor, linkKey])

  const handleRemove = useCallback(() => {
    if (linkKey === null) {
      return
    }

    // Place a collapsed selection inside the link so TOGGLE_LINK_COMMAND's
    // collapsed-selection path ($toggleLink line 592) does a clean unwrap
    // (splice children into parent, remove empty LinkNode). A non-collapsed
    // selection would take the `$splitLinkAtSelection` path which is designed
    // for partial unlinks and may not handle full-span selections well.
    editor.update(() => {
      const node = $getNodeByKey(linkKey)
      if (node === null || !$isLinkNode(node)) {
        return
      }
      // Collapsed at start of first child — triggers the unwrap path.
      node.select(0, 0)
    })
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    clearLink()
    setShowLinkPopover(false)
  }, [editor, linkKey, clearLink])

  // --- Render ----------------------------------------------------------------

  if (linkKey === null || position === null) {
    return null
  }

  return (
    <>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="链接操作"
        tabIndex={-1}
        className="inkling-floating-link-toolbar absolute z-50 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-popover/95 px-2 py-0.5 shadow-md backdrop-blur-sm"
        style={{ top: position.top, left: position.left }}
        onMouseEnter={handleToolbarMouseEnter}
        onMouseLeave={handleToolbarMouseLeave}
      >
        <LinkUrlLabel href={href} />
        <LinkToolbarButton title="编辑链接" onClick={handleEdit}>
          编辑
        </LinkToolbarButton>
        <LinkToolbarButton title="移除链接" onClick={handleRemove}>
          移除
        </LinkToolbarButton>
      </div>
      {showLinkPopover ? <LinkPopover editor={editor} onClose={() => setShowLinkPopover(false)} /> : null}
    </>
  )
}

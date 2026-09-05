import type { MouseEvent as ReactMouseEvent } from 'react'

import { $getRoot, $isDecoratorNode } from 'lexical'
import React from 'react'

import type { ExternalControlAPI } from '@/'

// The focus-below-canvas guard attributes: a gesture that STARTS on any of
// these must not be followed by a re-focus on mouseup (a mousedown can
// select a node which deselects another, so the mouseup lands somewhere the
// initial click didn't intend).
const GUARD_ATTRIBUTES = ['data-lexical-decorator', 'data-inkling-slash-menu', 'data-inkling-portal']

function clickedOnGuard(target: Element): boolean {
  return GUARD_ATTRIBUTES.some((attr) => target.closest(`[${attr}]`) !== null || target.hasAttribute(attr))
}

/**
 * The demo chrome's focus-below-canvas choreography (previously triplicated
 * across the three demos — and drifted: the mousedown ref and the portal
 * guard existed in only one of them). Clicking below the editor canvas
 * focuses the editor with the caret at the document end (creating a
 * trailing paragraph when the document ends in a card, and scrolling to
 * it); gestures starting on a decorator, the slash menu, or a portal are
 * left alone.
 */
export function useFocusBelowCanvas({
  editorAPI,
  containerRef,
}: {
  editorAPI: ExternalControlAPI | null
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const skipFocusEditor = React.useRef(false)

  const onMouseDown = React.useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && clickedOnGuard(event.target)) {
      skipFocusEditor.current = true
    }
  }, [])

  const onClick = React.useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) {
        skipFocusEditor.current = false
        return
      }
      const target = event.target

      if (!skipFocusEditor.current && editorAPI && !clickedOnGuard(target)) {
        const rootElement = editorAPI.editorInstance.getRootElement()

        // if a mousedown and subsequent mouseup occurs below the editor
        // canvas, focus the editor and put the cursor at the end of the document
        if (
          rootElement &&
          event.pageY > rootElement.getBoundingClientRect().bottom &&
          event.clientY > rootElement.getBoundingClientRect().bottom
        ) {
          event.preventDefault()

          // we should always have a visible cursor when focusing
          // at the bottom so create an empty paragraph if last
          // section is a card
          let addLastParagraph = false

          editorAPI.editorInstance.getEditorState().read(() => {
            const nodes = $getRoot().getChildren()
            const lastNode = nodes[nodes.length - 1]

            if (lastNode && $isDecoratorNode(lastNode)) {
              addLastParagraph = true
            }
          })

          if (addLastParagraph) {
            editorAPI.insertParagraphAtBottom()
          }

          // Focus the editor
          editorAPI.focusEditor({ position: 'bottom' })

          // scroll to the bottom of the container
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight
          }
        }
      }

      skipFocusEditor.current = false
    },
    [editorAPI, containerRef],
  )

  return { onMouseDown, onClick }
}

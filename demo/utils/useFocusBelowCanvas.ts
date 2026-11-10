import type { MouseEvent as ReactMouseEvent } from 'react'

import { $getRoot, $isDecoratorNode } from 'lexical'
import React from 'react'

import type { ExternalControlAPI } from '@/inkling'

// Focus-below-canvas guard attributes: a gesture that starts on any of these must not be followed by a re-focus on
// mouseup (a mousedown can select a node which deselects another, so the mouseup lands somewhere unintended).
const GUARD_ATTRIBUTES = ['data-lexical-decorator', 'data-inkling-slash-menu', 'data-inkling-portal']

function clickedOnGuard(target: Element): boolean {
  return GUARD_ATTRIBUTES.some((attr) => target.closest(`[${attr}]`) !== null || target.hasAttribute(attr))
}

/**
 * Clicking below the editor canvas focuses the editor with the caret at the document end (adding a trailing
 * paragraph when the document ends in a card); decorator/slash-menu/portal gestures are left alone.
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

        if (
          rootElement &&
          event.pageY > rootElement.getBoundingClientRect().bottom &&
          event.clientY > rootElement.getBoundingClientRect().bottom
        ) {
          event.preventDefault()

          // Always leave a visible cursor at the bottom: add an empty paragraph when the last section is a card.
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

          editorAPI.focusEditor({ position: 'bottom' })

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

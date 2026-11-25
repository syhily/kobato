import type { ExternalControlAPI } from '@kobato/inkling'

import { $getRoot, $isDecoratorNode } from 'lexical'
import { type MouseEvent as ReactMouseEvent, type RefObject, useCallback, useRef } from 'react'

const GUARD_ATTRIBUTES = ['data-lexical-decorator', 'data-inkling-slash-menu', 'data-inkling-portal']

function clickedOnGuard(target: Element): boolean {
  return GUARD_ATTRIBUTES.some((attr) => target.closest(`[${attr}]`) !== null || target.hasAttribute(attr))
}

export function useFocusBelowCanvas({
  editorAPI,
  containerRef,
}: {
  editorAPI: ExternalControlAPI | null
  containerRef: RefObject<HTMLDivElement | null>
}) {
  const skipFocusEditor = useRef(false)

  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && clickedOnGuard(event.target)) {
      skipFocusEditor.current = true
    }
  }, [])

  const onClick = useCallback(
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

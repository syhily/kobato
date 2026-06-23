/** Faithful copy of Koenig's FloatingFormatToolbar.jsx — snippet, link-search, link-toolbar removed */
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DELETE_CHARACTER_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { useRef, useCallback, useEffect } from 'react'

import { FloatingToolbar } from '@/ui/inkling/components/ui/FloatingToolbar'
import { FormatToolbar } from '@/ui/inkling/components/ui/FormatToolbar'

/** Minimal debounce (replaces lodash/debounce to avoid a new dependency). */
function debounce<T extends (...args: never[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => fn(...args), delay)
  }
}

const MOUSE_MOVE_THRESHOLD = 5

export const toolbarItemTypes = {
  link: 'link',
  text: 'text',
} as const

export type ToolbarItemType = (typeof toolbarItemTypes)[keyof typeof toolbarItemTypes] | null

export function FloatingFormatToolbar({
  editor,
  anchorElem,
  href,
  toolbarItemType,
  setToolbarItemType,
  hiddenFormats = [],
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  href: string
  toolbarItemType: ToolbarItemType
  setToolbarItemType: (type: ToolbarItemType) => void
  hiddenFormats?: string[]
}) {
  const toolbarRef = useRef<HTMLDivElement>(null)

  const showToolbarIfHidden = useCallback(
    (_e?: MouseEvent) => {
      if (toolbarItemType && toolbarRef.current?.style.opacity === '0') {
        toolbarRef.current.style.opacity = '1'
      }
    },
    [toolbarItemType],
  )

  useEffect(() => {
    const toggle = (e: MouseEvent) => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const selectedNodeMatchesTarget = selection.getNodes().find((node) => {
            const element = editor.getElementByKey(node.getKey())
            return element && (element.contains(e.target as Node) || (e.target as Node).contains(element))
          })

          if (selectedNodeMatchesTarget) {
            showToolbarIfHidden(e)
          }
        }
      })
    }

    document.addEventListener('mouseup', toggle)
    document.addEventListener('touchend', toggle as EventListener)

    return () => {
      document.removeEventListener('mouseup', toggle)
      document.removeEventListener('touchend', toggle as EventListener)
    }
  }, [editor, showToolbarIfHidden])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        () => {
          setToolbarItemType(null)
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, setToolbarItemType])

  useEffect(() => {
    let initialPosition: { x: number; y: number } | null = null

    const onMouseMove = (e: MouseEvent) => {
      // ignore drag events
      if (e?.buttons > 0) {
        return
      }

      // avoid toggling toolbar until mouse has moved a certain distance
      if (!initialPosition) {
        initialPosition = { x: e.clientX, y: e.clientY }
      }

      const distanceMoved = Math.sqrt(
        Math.pow(e.clientX - initialPosition.x, 2) + Math.pow(e.clientY - initialPosition.y, 2),
      )

      if (distanceMoved < MOUSE_MOVE_THRESHOLD) {
        return
      }

      // reset initial position after threshold is met
      initialPosition = null

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (selection === null || !$isRangeSelection(selection)) {
          return
        }
        if (selection.getTextContent() !== null) {
          showToolbarIfHidden()
        }
      })
    }
    const debouncedOnMouseMove = debounce(onMouseMove, 10)
    document.addEventListener('mousemove', debouncedOnMouseMove)
    return () => {
      document.removeEventListener('mousemove', debouncedOnMouseMove)
    }
  }, [editor, showToolbarIfHidden])

  const isLinkToolbar = toolbarItemTypes.link === toolbarItemType
  const isTextToolbar = toolbarItemTypes.text === toolbarItemType

  const showTextToolbar = isTextToolbar

  return (
    <FloatingToolbar
      anchorElem={anchorElem}
      editor={editor}
      isVisible={!!toolbarItemType}
      shouldReposition={toolbarItemType !== toolbarItemTypes.text}
    >
      {isLinkToolbar && (
        // Simplified link input — Koenig's LinkActionToolbar with URL input only
        <FormatToolbar
          editor={editor}
          hiddenFormats={hiddenFormats}
          isLinkSelected={!!href}
          onLinkClick={() => setToolbarItemType(toolbarItemTypes.text)}
        />
      )}

      {showTextToolbar && (
        <FormatToolbar
          editor={editor}
          hiddenFormats={hiddenFormats}
          isLinkSelected={!!href}
          onLinkClick={() => setToolbarItemType(toolbarItemTypes.link)}
        />
      )}
    </FloatingToolbar>
  )
}

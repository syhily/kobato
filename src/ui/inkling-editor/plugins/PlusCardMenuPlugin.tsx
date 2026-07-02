import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import React from 'react'

import { CardMenu, type CardMenuItemData } from '@/ui/inkling-editor/components/ui/CardMenu'
import { PlusButton, PlusMenu } from '@/ui/inkling-editor/components/ui/PlusMenu'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { buildCardMenu } from '@/ui/inkling-editor/utils/buildCardMenu'
import { getEditorCardNodes } from '@/ui/inkling-editor/utils/getEditorCardNodes'
import { getSelectedNode } from '@/ui/inkling-editor/utils/getSelectedNode'

function usePlusCardMenu(editor: LexicalEditor): React.ReactElement | null {
  const [isShowingButton, setIsShowingButton] = React.useState<boolean>(false)
  const [isShowingMenu, setIsShowingMenu] = React.useState<boolean>(false)
  const [topPosition, setTopPosition] = React.useState<number>(0)
  const [cachedRange, setCachedRange] = React.useState<Range | null>(null)
  const [cardMenu, setCardMenu] = React.useState<ReturnType<typeof buildCardMenu>>({
    menu: new Map(),
    maxItemIndex: 0,
  })
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const { cardConfig } = React.useContext(InklingComposerContext)

  function getTopPosition(elem: Element): number {
    const elemRect = elem.getBoundingClientRect()
    const parent = elem.parentElement
    if (!parent) {
      return 0
    }
    const containerRect = parent.getBoundingClientRect()
    return elemRect.top - containerRect.top
  }

  function getElementRange(elem: Element): Range {
    const range = new Range()
    range.setStart(elem, 0)
    range.setEnd(elem, 0)
    return range
  }

  const moveCursorToCachedRange = React.useCallback(() => {
    if (!cachedRange) {
      return
    }
    const sel = document.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(cachedRange)
  }, [cachedRange])

  const showButton = React.useCallback(
    (elem: Element) => {
      const range = getElementRange(elem)
      setCachedRange(range)
      setIsShowingButton(true)
    },
    [setIsShowingButton, setCachedRange],
  )

  const hideButton = React.useCallback(() => {
    setIsShowingButton(false)
    setIsShowingMenu(false)
    setCachedRange(null)
  }, [setIsShowingButton, setIsShowingMenu, setCachedRange])

  const openMenu = React.useCallback(
    (event?: React.MouseEvent) => {
      event?.preventDefault()

      editor.update(
        () => {
          $setSelection(null)
        },
        { discrete: true },
      )

      moveCursorToCachedRange()
      setIsShowingMenu(true)
    },
    [editor, moveCursorToCachedRange, setIsShowingMenu],
  )

  const closeMenu = React.useCallback(
    ({ resetCursor = false } = {}) => {
      if (resetCursor) {
        moveCursorToCachedRange()
      }
      setIsShowingMenu(false)
    },
    [moveCursorToCachedRange, setIsShowingMenu],
  )

  const updateButton = React.useCallback(() => {
    editor.getEditorState().read(() => {
      if (editor.isComposing()) {
        return
      }

      const selection = $getSelection()

      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        hideButton()
        return
      }

      const node = getSelectedNode(selection)

      if (!$isParagraphNode(node) || node.getTextContent() !== '') {
        hideButton()
        return
      }

      const nativeSelection = window.getSelection()
      const p = nativeSelection?.anchorNode
      const rootElement = editor.getRootElement()

      if (!p || !(p instanceof Element) || p.tagName !== 'P' || !rootElement?.contains(p)) {
        hideButton()
        return
      }

      setTopPosition(getTopPosition(p))
      showButton(p)
    })
  }, [editor, showButton, hideButton])

  const insert = React.useCallback(
    (insertCommand: unknown, { insertParams = {} } = {}): void => {
      const commandParams = { ...insertParams }
      editor.dispatchCommand(insertCommand as Parameters<typeof editor.dispatchCommand>[0], commandParams)
      closeMenu()
    },
    [editor, closeMenu],
  )

  React.useEffect(() => {
    return editor.registerUpdateListener(() => {
      updateButton()
    })
  }, [editor, updateButton])

  const hideButtonOnOutsideSelection = React.useCallback(() => {
    if (isShowingButton) {
      const nativeSelection = window.getSelection()

      if (isShowingMenu && containerRef.current?.contains(nativeSelection?.anchorNode as Node)) {
        return
      }

      const rootElement = editor.getRootElement()
      const anchorNode = nativeSelection?.anchorNode

      if (!anchorNode || !rootElement?.contains(anchorNode)) {
        hideButton()
      }
    }
  }, [editor, isShowingButton, isShowingMenu, hideButton])

  React.useEffect(() => {
    document.addEventListener('selectionchange', hideButtonOnOutsideSelection)
    return () => {
      document.removeEventListener('selectionchange', hideButtonOnOutsideSelection)
    }
  }, [hideButtonOnOutsideSelection])

  const updateButtonOnMousemove = React.useCallback(
    (event: MouseEvent) => {
      if (isShowingMenu) {
        return
      }

      const rootElement = editor.getRootElement()
      if (!rootElement) {
        return
      }
      let { pageX, pageY } = event

      const containerRect = rootElement.getBoundingClientRect()
      if (pageX < containerRect.left) {
        pageX = pageX + 40
      }

      const hoveredElem = document.elementFromPoint(pageX, pageY)

      if (hoveredElem && rootElement.contains(hoveredElem) && !hoveredElem.closest('[data-inkling-card]')) {
        if (hoveredElem.tagName === 'P' && hoveredElem.textContent === '') {
          setTopPosition(getTopPosition(hoveredElem))
          showButton(hoveredElem)
        } else {
          updateButton()
        }
      }
    },
    [editor, isShowingMenu, setTopPosition, showButton, updateButton],
  )

  React.useEffect(() => {
    window.addEventListener('mousemove', updateButtonOnMousemove)
    return () => {
      window.removeEventListener('mousemove', updateButtonOnMousemove)
    }
  }, [updateButtonOnMousemove])

  const closeMenuOnClickOutside = React.useCallback(
    (event: MouseEvent) => {
      if (isShowingMenu) {
        if (!containerRef.current?.contains(event.target as Node)) {
          return closeMenu()
        }
      }
    },
    [isShowingMenu, closeMenu],
  )

  React.useEffect(() => {
    window.addEventListener('mousedown', closeMenuOnClickOutside)
    return () => {
      window.removeEventListener('mousedown', closeMenuOnClickOutside)
    }
  }, [closeMenuOnClickOutside])

  const handleKeydown = React.useCallback(
    (event: KeyboardEvent) => {
      if (isShowingMenu) {
        if (event.key === 'Escape') {
          closeMenu({ resetCursor: true })
          return
        }

        const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
        if (arrowKeys.includes(event.key)) {
          closeMenu()
        }
      }
    },
    [isShowingMenu, closeMenu],
  )

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [handleKeydown])

  React.useEffect(() => {
    const cardNodes = getEditorCardNodes(editor)
    setCardMenu(buildCardMenu(cardNodes as [string, LexicalNode][], { config: cardConfig }))
  }, [cardConfig, editor])

  const style: React.CSSProperties = {
    top: `${topPosition}px`,
  }

  if (cardMenu.menu?.size === 0) {
    return null
  }

  if (isShowingButton) {
    return (
      <div ref={containerRef} className="absolute z-50" style={style} data-inkling-plus-container>
        {isShowingButton && <PlusButton onClick={openMenu} />}
        {isShowingMenu && (
          <PlusMenu>
            <CardMenu closeMenu={closeMenu} insert={insert} menu={cardMenu.menu as Map<string, CardMenuItemData[]>} />
          </PlusMenu>
        )}
      </div>
    )
  } else {
    return null
  }
}

export default function PlusCardMenuPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext()
  return usePlusCardMenu(editor)
}

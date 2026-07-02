import type { LexicalCommand, LexicalEditor, RangeSelection } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import React from 'react'

import type { BuildCardMenuResult } from '@/ui/inkling-editor/utils/buildCardMenu'

import { CardMenu } from '@/ui/inkling-editor/components/ui/CardMenu'
import { SlashMenu } from '@/ui/inkling-editor/components/ui/SlashMenu'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { buildCardMenu } from '@/ui/inkling-editor/utils/buildCardMenu'
import { getEditorCardNodes } from '@/ui/inkling-editor/utils/getEditorCardNodes'
import { getSelectedNode } from '@/ui/inkling-editor/utils/getSelectedNode'

interface MenuPosition {
  top?: number | null
  left?: number
  bottom?: number | null
}

function useSlashCardMenu(editor: LexicalEditor) {
  const [isShowingMenu, setIsShowingMenu] = React.useState(false)
  const [position, setPosition] = React.useState<MenuPosition>({})
  const [query, setQuery] = React.useState('')
  const [commandParams, setCommandParams] = React.useState<string[]>([])
  const [cardMenu, setCardMenu] = React.useState<BuildCardMenuResult>({} as BuildCardMenuResult)
  const [selectedItemIndex, setSelectedItemIndex] = React.useState(0)
  const [scrollToSelectedItem, setScrollToSelectedItem] = React.useState(false)
  const cachedRange = React.useRef<Range | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const { cardConfig } = React.useContext(InklingComposerContext)

  function setMenuPosition(elem: HTMLElement) {
    const elemRect = elem.getBoundingClientRect()
    const containerRect = (elem.parentNode as HTMLElement).getBoundingClientRect()
    const menuRect = containerRef.current?.getBoundingClientRect()

    if (!menuRect) {
      return
    }

    const wouldBeOffscreenBottom = elemRect.bottom - containerRect.top + menuRect.height > window.innerHeight
    const wouldBeOffscreenTop = elemRect.top - menuRect.height < 0

    if (wouldBeOffscreenBottom && !wouldBeOffscreenTop) {
      const bottom = containerRect.height - elem.offsetTop
      setPosition({ top: null, left: 0, bottom })
    } else {
      const top = elem.offsetTop + elemRect.height
      setPosition({ top, left: 0, bottom: null })
    }
  }

  function getSelectionElement(): HTMLElement | null {
    const nativeSelection = window.getSelection()
    let selectionElem: HTMLElement | null = null

    if (nativeSelection && nativeSelection.anchorNode && nativeSelection.anchorNode.nodeType === Node.TEXT_NODE) {
      selectionElem = (nativeSelection.anchorNode.parentNode as HTMLElement | null)?.closest('p') ?? null
    } else if (nativeSelection) {
      selectionElem = nativeSelection.anchorNode as HTMLElement | null
    }
    return selectionElem
  }

  function moveCursorToCachedRange() {
    if (!cachedRange.current) {
      return
    }
    const sel = document.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(cachedRange.current)
    }
  }

  const openMenu = React.useCallback(() => {
    setIsShowingMenu(true)
  }, [setIsShowingMenu])

  const closeMenu = React.useCallback(
    ({ resetCursor = false }: { resetCursor?: boolean } = {}) => {
      if (resetCursor) {
        moveCursorToCachedRange()
      }
      setIsShowingMenu(false)
      setQuery('')
      if (commandParams.length > 0) {
        setCommandParams([])
      }
      setScrollToSelectedItem(false)
      cachedRange.current = null
    },
    [setIsShowingMenu, commandParams],
  )

  const insert = React.useCallback(
    (
      insertCommand: unknown,
      {
        insertParams = {},
        queryParams = {},
      }: { insertParams?: Record<string, unknown>; queryParams?: Record<string, unknown> } = {},
    ) => {
      const dataset = { ...insertParams }
      const queryParamsArray = Object.values(queryParams).filter((v): v is string => typeof v === 'string')

      for (let i = 0; i < queryParamsArray.length; i++) {
        if (commandParams[i]) {
          const key = queryParamsArray[i]
          const value = commandParams[i]
          dataset[key] = value
        }
      }

      editor.update(() => {
        const selection = $getSelection() as RangeSelection

        const focusPNode = selection.focus.getNode().getTopLevelElement()
        if (!focusPNode) {
          return
        }

        // paragraphs at the beginning of the document will delete themselves
        // via .collapseAtStart() if their contents are deleted so we create
        // a new paragraph and delete the old one before the insert command
        // replaces the selection with the new node
        const paragraph = $createParagraphNode()
        focusPNode.insertAfter(paragraph)
        focusPNode.remove()
        paragraph.select()

        editor.dispatchCommand(insertCommand as LexicalCommand<unknown>, dataset)
      })

      closeMenu()
    },
    [editor, commandParams, closeMenu],
  )

  // close menu if selection moves out of the slash command
  // update the search query when typing
  React.useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        // don't do anything when using IME input
        if (editor.isComposing()) {
          return
        }

        const selection = $getSelection()

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          const nativeSelection = window.getSelection()
          const anchorNode = nativeSelection?.anchorNode
          const isMenuSection = (anchorNode?.parentNode as HTMLElement | null)?.dataset?.cardMenuSection

          // don't close the menu if the selection inside the card section
          if (isMenuSection) {
            return
          }

          closeMenu()
          return
        }

        const node = getSelectedNode(selection).getTopLevelElement()

        if (!node || !$isParagraphNode(node) || !node.getTextContent().startsWith('/')) {
          closeMenu()
          return
        }

        const nativeSelection = window.getSelection()
        const anchorNode = nativeSelection?.anchorNode
        const rootElement = editor.getRootElement()

        if (anchorNode?.nodeType !== Node.TEXT_NODE || !rootElement?.contains(anchorNode)) {
          closeMenu()
          return
        }

        // store the cached range so we can reset the cursor when Escape is pressed
        // because that will _always_ blur the contenteditable which we don't want
        if (nativeSelection) {
          cachedRange.current = nativeSelection.getRangeAt(0)
        }

        // capture text after the / as a query for filtering cards
        const command = node.getTextContent().slice(1)
        const [q, ...cps] = command.split(' ')
        setQuery(q)
        setCommandParams(cps)
      })
    })
  }, [editor, isShowingMenu, closeMenu, setQuery, setCommandParams])

  // open the menu when / is pressed on a blank paragraph
  React.useEffect(() => {
    if (isShowingMenu) {
      return
    }

    const triggerMenu = (event: KeyboardEvent) => {
      const { key, isComposing, ctrlKey, metaKey } = event

      // we only care about / presses when not composing or pressed with modifiers
      if (key !== '/' || isComposing || ctrlKey || metaKey) {
        return
      }

      // ignore if editor doesn't have focus
      const rootElement = editor.getRootElement()
      if (!rootElement?.matches(':focus')) {
        return
      }

      // potentially valid / press
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }
        const node = getSelectedNode(selection).getTopLevelElement()

        // ignore if selection is not on a top-level paragraph
        if (!node || !$isParagraphNode(node)) {
          return
        }

        const paragraphSize = node.getTextContentSize()
        const isEmptyParagraph = selection.isCollapsed() && node.getTextContent() === ''
        // if full paragraph is selected, pressing / will replace it so that's a valid press
        const isFullParagraphSelection =
          !selection.isCollapsed() &&
          ((selection.anchor.offset === 0 && selection.focus.offset === paragraphSize) ||
            (selection.anchor.offset === paragraphSize && selection.focus.offset === 0))

        if (isEmptyParagraph || isFullParagraphSelection) {
          openMenu()
        }
      })
    }

    window.addEventListener('keypress', triggerMenu)
    return () => {
      window.removeEventListener('keypress', triggerMenu)
    }
  }, [editor, isShowingMenu, openMenu])

  // close the menu when Escape is pressed
  React.useEffect(() => {
    if (!isShowingMenu) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu({ resetCursor: true })
        return
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isShowingMenu, closeMenu])

  // close the menu on clicks outside the menu
  React.useEffect(() => {
    if (!isShowingMenu) {
      return
    }

    const handleMousedown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return
      }

      closeMenu()
    }

    window.addEventListener('mousedown', handleMousedown)
    return () => {
      window.removeEventListener('mousedown', handleMousedown)
    }
  }, [isShowingMenu, closeMenu])

  // capture key navigation to move/insert selected card item
  React.useEffect(() => {
    if (!isShowingMenu) {
      return
    }

    const moveUp = (event: KeyboardEvent) => {
      if (selectedItemIndex === 0) {
        setSelectedItemIndex(cardMenu.maxItemIndex)
      } else {
        setSelectedItemIndex(selectedItemIndex - 1)
      }
      setScrollToSelectedItem(true)

      event.preventDefault()
      return true
    }

    const moveDown = (event: KeyboardEvent) => {
      if (selectedItemIndex === cardMenu.maxItemIndex) {
        setSelectedItemIndex(0)
      } else {
        setSelectedItemIndex(selectedItemIndex + 1)
      }
      setScrollToSelectedItem(true)

      event.preventDefault()
      return true
    }

    const enter = (event: KeyboardEvent) => {
      ;(
        document.querySelector(
          `[data-inkling-slash-menu] [data-inkling-cardmenu-idx="${selectedItemIndex}"]`,
        ) as HTMLElement | null
      )?.click()
      event.preventDefault()
      return true
    }

    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, moveDown, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, moveUp, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, moveDown, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ARROW_LEFT_COMMAND, moveUp, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ENTER_COMMAND, enter, COMMAND_PRIORITY_HIGH),
    )
  }, [editor, isShowingMenu, cardMenu, selectedItemIndex])

  // build up the card menu based on registered nodes and current search
  React.useEffect(() => {
    const cardNodes = getEditorCardNodes(editor)
    setCardMenu(
      buildCardMenu(cardNodes, { insert, query, config: cardConfig } as {
        query?: string
        config?: typeof cardConfig
      }),
    )
    setSelectedItemIndex(0)
  }, [editor, query, insert, setCardMenu, setSelectedItemIndex, cardConfig])

  // attach a resize observer to call setMenuPosition when the window resizes
  React.useEffect(() => {
    if (!isShowingMenu) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setMenuPosition(getSelectionElement() as HTMLElement)
    })
    resizeObserver.observe(window.document.body)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isShowingMenu])

  // use this to position the menu based on the window size
  React.useLayoutEffect(() => {
    if (!isShowingMenu) {
      return
    }

    if (!containerRef || !containerRef.current) {
      return
    }

    setMenuPosition(getSelectionElement() as HTMLElement)
  }, [isShowingMenu])

  if (cardMenu.menu?.size === 0) {
    return null
  }

  if (isShowingMenu) {
    return (
      <div
        ref={containerRef}
        className="absolute -left-2 z-50 mt-2"
        style={position as React.CSSProperties}
        data-inkling-slash-container
      >
        <SlashMenu>
          <CardMenu
            closeMenu={closeMenu}
            insert={insert}
            // oxlint-disable-next-line typescript/no-explicit-any
            menu={cardMenu.menu as any}
            scrollToSelectedItem={scrollToSelectedItem}
            selectedItemIndex={selectedItemIndex}
          />
        </SlashMenu>
      </div>
    )
  }

  return null
}

export default function SlashCardMenuPlugin() {
  const [editor] = useLexicalComposerContext()
  return useSlashCardMenu(editor)
}

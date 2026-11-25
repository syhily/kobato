import type { CardMenuInsertParams } from '@kobato/inkling-internal/nodes/cards/card-menu-build'
import type { AnyLexicalCommand, LexicalEditor } from 'lexical'

import { CardMenu } from '@kobato/inkling-internal/components/ui/CardMenu'
import { PlusButton, PlusMenu } from '@kobato/inkling-internal/components/ui/PlusMenu'
import { SlashMenu } from '@kobato/inkling-internal/components/ui/SlashMenu'
import { createMenuNavigator, type MenuNavigator } from '@kobato/inkling-internal/hooks/card-menu-navigation'
import { useCardMenu } from '@kobato/inkling-internal/hooks/useCardMenu'
import { useCardMenuSession } from '@kobato/inkling-internal/hooks/useCardMenuSession'
import { useSelectionAnchoredPopup } from '@kobato/inkling-internal/hooks/useSelectionAnchoredPopup'
import { useSlashCardMenuTrigger } from '@kobato/inkling-internal/hooks/useSlashCardMenuTrigger'
import {
  registerMenuArrowsClose,
  registerMenuKeyboardNavigation,
} from '@kobato/inkling-internal/plugins/behaviour/card-menu-keyboard'
import {
  shouldHidePlusButtonOnSelectionChange,
  type PlusButtonVerdict,
} from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import trackEvent from '@kobato/inkling-internal/utils/analytics'
import { resolveAnchoredPopupPlacement } from '@kobato/inkling-internal/utils/selection-anchored-popup'
import { $setSelection } from 'lexical'
import {
  type Ref,
  type ReactElement,
  type MouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
export interface CardMenuPopupHandle {
  openMenu: () => void
  applyButtonVerdict: (verdict: PlusButtonVerdict) => void
  applyHoverButtonVerdict: (verdict: PlusButtonVerdict) => void
  hideButtonOnOutsideSelection: () => void
}
export interface CardMenuPopupProps {
  editor: LexicalEditor
  trigger: 'slash' | 'button'
  anchor: 'selection' | 'button'

  replaceTriggerParagraph?: boolean
  ref?: Ref<CardMenuPopupHandle>
}

function getTopPosition(elem: Element, positioningParent: HTMLElement): number {
  const placement = resolveAnchoredPopupPlacement({
    positioning: 'absolute',
    absoluteEdge: 'at-anchor',
    anchorRect: elem.getBoundingClientRect(),
    containerRect: positioningParent.getBoundingClientRect(),
    coordinateScale: resolveCoordinateScale(positioningParent),
    popupHeight: 0,
    scrollTop: 0,
    scrollHeight: 0,
    viewportHeight: 0,
  })
  return placement.top ?? 0
}

function resolveCoordinateScale(positioningParent: HTMLElement): number {
  const localWidth = positioningParent.offsetWidth
  if (localWidth <= 0) {
    return 1
  }
  return positioningParent.getBoundingClientRect().width / localWidth
}

function getElementRange(elem: Element): Range {
  const range = new Range()
  range.setStart(elem, 0)
  range.setEnd(elem, 0)
  return range
}

export function CardMenuPopup({
  editor,
  trigger,
  anchor: anchorPolicy,
  replaceTriggerParagraph = false,
  ref,
}: CardMenuPopupProps): ReactElement | null {
  const isSlash = trigger === 'slash'
  const { containerRef, isOpen, openMenu, closeMenu, insert: sessionInsert, saveCursor } = useCardMenuSession()

  const { query, commandParams } = useSlashCardMenuTrigger(editor, { isOpen, closeMenu, saveCursor }, isSlash)

  const [menuNavigator] = useState<MenuNavigator>(() => createMenuNavigator())
  const { selectedItemIndex, scrollToSelectedItem } = useSyncExternalStore(
    menuNavigator.subscribe,
    menuNavigator.getSnapshot,
  )

  const [buttonAnchor, setButtonAnchor] = useState<{ top: number; range: Range } | null>(null)

  const getSelectionElement = useCallback((): HTMLElement | null => {
    const anchorNode = window.getSelection()?.anchorNode

    if (!anchorNode) {
      return null
    }

    if (anchorNode.nodeType === Node.TEXT_NODE) {
      return anchorNode.parentElement?.closest('p') ?? null
    }

    return anchorNode instanceof HTMLElement ? anchorNode : null
  }, [])

  const getPositioningParent = useCallback(
    (anchorFallback?: Element | null): HTMLElement | null => {
      const mountedParent = containerRef.current?.offsetParent
      if (mountedParent instanceof HTMLElement) {
        return mountedParent
      }
      const wrapper = editor.getRootElement()?.closest('.inkling-lexical')
      if (wrapper instanceof HTMLElement) {
        return wrapper
      }
      return anchorFallback instanceof HTMLElement ? anchorFallback : null
    },
    [editor, containerRef],
  )

  const updatePopupPosition = useSelectionAnchoredPopup({
    editor,
    popupRef: containerRef,
    positioning: 'absolute',
    absoluteEdge: 'below',
    absoluteFlip: 'measured',

    anchor: () => (anchorPolicy === 'selection' ? (getSelectionElement()?.getBoundingClientRect() ?? null) : null),
    containerRect: () =>
      anchorPolicy === 'selection'
        ? (getPositioningParent(getSelectionElement()?.parentElement)?.getBoundingClientRect() ?? null)
        : null,
    coordinateScale: () => {
      const parent = getPositioningParent(getSelectionElement()?.parentElement)
      return parent ? resolveCoordinateScale(parent) : 1
    },
  })

  useLayoutEffect(() => {
    if (anchorPolicy === 'selection' && isOpen) {
      updatePopupPosition()
    }
  }, [anchorPolicy, isOpen, updatePopupPosition])

  const { cardMenu, insert: insertCardItem } = useCardMenu(editor, isSlash ? query : undefined, {
    commandParams: isSlash ? commandParams : undefined,
    replaceTriggerParagraph,
  })
  const insert = useCallback(
    (insertCommand: AnyLexicalCommand | undefined, params: CardMenuInsertParams = {}): void => {
      if (!insertCommand) {
        return
      }
      sessionInsert(() => insertCardItem(insertCommand, params))
    },
    [sessionInsert, insertCardItem],
  )

  const showButton = useCallback(
    (paragraph: Element) => {
      const positioningParent = getPositioningParent(paragraph.parentElement)
      if (!positioningParent) {
        return
      }
      setButtonAnchor({ top: getTopPosition(paragraph, positioningParent), range: getElementRange(paragraph) })
    },
    [getPositioningParent],
  )

  const hideButton = useCallback(() => {
    setButtonAnchor(null)
    closeMenu()
  }, [closeMenu])

  const applyButtonVerdict = useCallback(
    (verdict: PlusButtonVerdict) => {
      if (verdict.type === 'show') {
        showButton(verdict.paragraph)
      } else {
        hideButton()
      }
    },
    [showButton, hideButton],
  )

  const applyHoverButtonVerdict = useCallback(
    (verdict: PlusButtonVerdict) => {
      if (isOpen) {
        return
      }
      applyButtonVerdict(verdict)
    },
    [isOpen, applyButtonVerdict],
  )

  const openMenuFromButton = useCallback(
    (event?: MouseEvent) => {
      event?.preventDefault()

      editor.update(
        () => {
          $setSelection(null)
        },
        { discrete: true },
      )

      openMenu({ anchor: buttonAnchor?.range })
    },
    [editor, buttonAnchor, openMenu],
  )

  const hideButtonOnOutsideSelection = useCallback(() => {
    if (!buttonAnchor) {
      return
    }

    const shouldHide = shouldHidePlusButtonOnSelectionChange(
      window.getSelection()?.anchorNode ?? null,
      editor.getRootElement(),
      isOpen ? containerRef.current : null,
    )
    if (shouldHide) {
      hideButton()
    }
  }, [editor, buttonAnchor, isOpen, hideButton, containerRef])

  useImperativeHandle(
    ref,
    (): CardMenuPopupHandle => ({
      openMenu,
      applyButtonVerdict,
      applyHoverButtonVerdict,
      hideButtonOnOutsideSelection,
    }),
    [openMenu, applyButtonVerdict, applyHoverButtonVerdict, hideButtonOnOutsideSelection],
  )

  useEffect(() => {
    if (!isSlash || !isOpen) {
      return
    }
    return registerMenuKeyboardNavigation(editor, {
      isOpen: () => isOpen,
      moveUp: () => menuNavigator.moveUp(cardMenu.maxItemIndex),
      moveDown: () => menuNavigator.moveDown(cardMenu.maxItemIndex),
      selectedItem: () => menuNavigator.selectedItem(cardMenu.items),
      onSelect: (item) => {
        insert(item.insertCommand, item)
        trackEvent('Card Added', { card: item.label ?? 'unknown' })
      },
    })
  }, [editor, isSlash, isOpen, cardMenu, insert, menuNavigator])

  useEffect(() => {
    if (isSlash || !isOpen) {
      return
    }
    return registerMenuArrowsClose({ isOpen: () => isOpen, close: closeMenu })
  }, [isSlash, isOpen, closeMenu])

  const previousCardMenuRef = useRef<typeof cardMenu | null>(null)
  useEffect(() => {
    if (previousCardMenuRef.current === cardMenu) {
      return
    }
    previousCardMenuRef.current = cardMenu
    menuNavigator.reset()
  })

  useEffect(() => {
    if (!isOpen) {
      menuNavigator.consumeScrollRequest()
    }
  }, [isOpen, menuNavigator])

  if (cardMenu.items.length === 0) {
    return null
  }
  if (anchorPolicy === 'button') {
    if (!buttonAnchor) {
      return null
    }
    return (
      <div
        ref={containerRef}
        className="absolute z-50"
        style={{ top: `${buttonAnchor.top}px` }}
        data-inkling-plus-container
      >
        <PlusButton onClick={openMenuFromButton} />
        {isOpen && (
          <PlusMenu>
            <CardMenu closeMenu={closeMenu} insert={insert} sections={cardMenu.sections} />
          </PlusMenu>
        )}
      </div>
    )
  }

  if (!isOpen) {
    return null
  }

  return (
    <div ref={containerRef} className="absolute -left-2 z-50 mt-2" data-inkling-slash-container>
      <SlashMenu>
        <CardMenu
          closeMenu={closeMenu}
          insert={insert}
          scrollToSelectedItem={scrollToSelectedItem}
          sections={cardMenu.sections}
          selectedItemIndex={selectedItemIndex}
        />
      </SlashMenu>
    </div>
  )
}

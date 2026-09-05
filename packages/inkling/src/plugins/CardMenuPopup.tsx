import type { LexicalCommand, LexicalEditor } from 'lexical'

import { $setSelection } from 'lexical'
import React from 'react'

import { CardMenu } from '@/components/ui/CardMenu'
import { PlusButton, PlusMenu } from '@/components/ui/PlusMenu'
import { SlashMenu } from '@/components/ui/SlashMenu'
import { createMenuNavigator, type MenuNavigator } from '@/hooks/card-menu-navigation'
import { useCardMenu } from '@/hooks/useCardMenu'
import { useCardMenuSession } from '@/hooks/useCardMenuSession'
import { useSelectionAnchoredPopup } from '@/hooks/useSelectionAnchoredPopup'
import { useSlashCardMenuTrigger } from '@/hooks/useSlashCardMenuTrigger'
import { registerMenuArrowsClose, registerMenuKeyboardNavigation } from '@/plugins/behaviour/card-menu-keyboard'
import { shouldHidePlusButtonOnSelectionChange, type PlusButtonVerdict } from '@/plugins/behaviour/card-menu-trigger'
import trackEvent from '@/utils/analytics'
import { resolveAnchoredPopupPlacement } from '@/utils/selection-anchored-popup'

// CardMenuPopup — the one card-menu popup, parameterized over the two
// trigger/anchor pairings the slash and plus menus used to re-implement as
// near-duplicate skeletons. It owns the whole stack end-to-end: the session
// (cursor lease, close policy, insert-and-close), the slash trigger binding,
// the keyboard navigator, the menu data (useCardMenu), the single type-erased
// insert adapter, the anchor chrome, and the rendering. The plugins keep only
// their trigger wiring (slash keypress; plus mousemove/selectionchange/caret
// registration) and drive this popup through its handle.

/** The popup's imperative seam — the plugins' trigger wiring calls in here. */
export interface CardMenuPopupHandle {
  /** Slash trigger: a valid '/' press opens the menu. */
  openMenu: () => void
  /** Button anchor policy, caret verdicts: anchor the button to the verdict's
   * paragraph or hide it (always applied). */
  applyButtonVerdict: (verdict: PlusButtonVerdict) => void
  /** Button anchor policy, hover verdicts: as applyButtonVerdict, but ignored
   * while the menu is open — hover never moves an open menu's anchor. */
  applyHoverButtonVerdict: (verdict: PlusButtonVerdict) => void
  /** Button anchor policy: the selectionchange hide rule — a native selection
   * outside the editor (and outside the open menu) hides the button. */
  hideButtonOnOutsideSelection: () => void
}

export interface CardMenuPopupProps {
  editor: LexicalEditor
  /** Trigger syntax: 'slash' tracks the typed /query (menu filtering, command
   * params, keyboard selection); 'button' opens from the anchor chrome's
   * click — no query, and arrows close the menu. */
  trigger: 'slash' | 'button'
  /** Anchor policy: 'selection' positions the popup against the caret's
   * paragraph (absolute, below, measured flip); 'button' renders the anchor
   * chrome (the plus button) at the verdict paragraph's top with the menu
   * under it. */
  anchor: 'selection' | 'button'
  /** Slash-menu insert semantics: the trigger paragraph still carries the
   * /query text, so it is swapped for a fresh paragraph before the insert
   * command dispatches. Button inserts dispatch at the anchored caret as-is. */
  replaceTriggerParagraph?: boolean
  ref?: React.Ref<CardMenuPopupHandle>
}

// the button chrome sits at its paragraph's top, parent-relative — the
// anchored-popup seam's absolute at-anchor policy
function getTopPosition(elem: Element): number {
  const parent = elem.parentElement
  if (!parent) {
    return 0
  }
  const placement = resolveAnchoredPopupPlacement({
    positioning: 'absolute',
    absoluteEdge: 'at-anchor',
    anchorRect: elem.getBoundingClientRect(),
    containerRect: parent.getBoundingClientRect(),
    popupHeight: 0,
    scrollTop: 0,
    scrollHeight: 0,
    viewportHeight: 0,
  })
  return placement.top ?? 0
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
}: CardMenuPopupProps): React.ReactElement | null {
  const isSlash = trigger === 'slash'
  const { containerRef, isOpen, openMenu, closeMenu, insert: sessionInsert, saveCursor } = useCardMenuSession()

  // the slash trigger binding owns the typed query and leases each verdict's
  // cursor range into the session; inert for the button trigger syntax
  const { query, commandParams } = useSlashCardMenuTrigger(editor, { isOpen, closeMenu, saveCursor }, isSlash)

  // the keyboard-selection state machine (wrap-around index, scroll-request
  // latch, reset-on-rebuild) — only the slash trigger syntax wires commands
  // into it, but the reset lifecycle is the popup's either way
  const [menuNavigator] = React.useState<MenuNavigator>(() => createMenuNavigator())
  const { selectedItemIndex, scrollToSelectedItem } = React.useSyncExternalStore(
    menuNavigator.subscribe,
    menuNavigator.getSnapshot,
  )

  // the button anchor chrome (button policy only): the verdict paragraph's
  // top and its caret range. The range is the anchor for the session's
  // open-time verdict — the popup keeps it for the button's lifetime, so the
  // session only borrows it while the menu is open.
  const [buttonAnchor, setButtonAnchor] = React.useState<{ top: number; range: Range } | null>(null)

  // selection anchor: the trigger paragraph (the selection's closest <p>);
  // the positioning parent is that paragraph's parent — the seam resolves
  // the below/above placement from those rects
  const getSelectionElement = React.useCallback((): HTMLElement | null => {
    const anchorNode = window.getSelection()?.anchorNode

    if (!anchorNode) {
      return null
    }

    if (anchorNode.nodeType === Node.TEXT_NODE) {
      return anchorNode.parentElement?.closest('p') ?? null
    }

    return anchorNode instanceof HTMLElement ? anchorNode : null
  }, [])

  const updatePopupPosition = useSelectionAnchoredPopup({
    editor,
    popupRef: containerRef,
    positioning: 'absolute',
    absoluteEdge: 'below',
    absoluteFlip: 'measured',
    // the button policy positions its chrome statically (top from the
    // verdict) — the null anchor short-circuits every positioning pass
    anchor: () => (anchorPolicy === 'selection' ? (getSelectionElement()?.getBoundingClientRect() ?? null) : null),
    containerRect: () =>
      anchorPolicy === 'selection' ? (getSelectionElement()?.parentElement?.getBoundingClientRect() ?? null) : null,
  })

  // the popup mounts with the menu — request the positioning pass on open
  // (the subscription set covers resize/scroll while it stays open)
  React.useLayoutEffect(() => {
    if (anchorPolicy === 'selection' && isOpen) {
      updatePopupPosition()
    }
  }, [anchorPolicy, isOpen, updatePopupPosition])

  const { cardMenu, insert: insertCardItem } = useCardMenu(editor, isSlash ? query : undefined, {
    commandParams: isSlash ? commandParams : undefined,
    replaceTriggerParagraph,
  })

  // insert-and-close is the session's seam (it owns the close policy); this
  // is the single type-erased adapter both trigger syntaxes dispatch through
  const insert = React.useCallback(
    (
      insertCommand: LexicalCommand<unknown> | undefined,
      params: { insertParams?: Record<string, unknown>; queryParams?: string[] } = {},
    ): void => {
      // a menu item without an insert command has nothing to dispatch
      if (!insertCommand) {
        return
      }
      sessionInsert(() => insertCardItem(insertCommand, params))
    },
    [sessionInsert, insertCardItem],
  )

  // --- button anchor chrome (button policy only) -----------------------------

  const showButton = React.useCallback((paragraph: Element) => {
    setButtonAnchor({ top: getTopPosition(paragraph), range: getElementRange(paragraph) })
  }, [])

  const hideButton = React.useCallback(() => {
    setButtonAnchor(null)
    closeMenu()
  }, [closeMenu])

  const applyButtonVerdict = React.useCallback(
    (verdict: PlusButtonVerdict) => {
      if (verdict.type === 'show') {
        showButton(verdict.paragraph)
      } else {
        hideButton()
      }
    },
    [showButton, hideButton],
  )

  const applyHoverButtonVerdict = React.useCallback(
    (verdict: PlusButtonVerdict) => {
      if (isOpen) {
        return
      }
      applyButtonVerdict(verdict)
    },
    [isOpen, applyButtonVerdict],
  )

  // the button's click opens the menu on the chrome's anchor: clear the
  // editor selection, then hand the anchor range to the session — it leases
  // it and restores the caret before the menu mounts
  const openMenuFromButton = React.useCallback(
    (event?: React.MouseEvent) => {
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

  const hideButtonOnOutsideSelection = React.useCallback(() => {
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

  // the plugins' trigger wiring drives the popup through this handle
  React.useImperativeHandle(
    ref,
    (): CardMenuPopupHandle => ({
      openMenu,
      applyButtonVerdict,
      applyHoverButtonVerdict,
      hideButtonOnOutsideSelection,
    }),
    [openMenu, applyButtonVerdict, applyHoverButtonVerdict, hideButtonOnOutsideSelection],
  )

  // --- keyboard policy --------------------------------------------------------

  // slash: capture key navigation to move/insert the selected card item — the
  // policy is headless in @/plugins/behaviour/card-menu-keyboard; this effect
  // only mounts the registration while the slash menu is open
  React.useEffect(() => {
    if (!isSlash || !isOpen) {
      return
    }
    return registerMenuKeyboardNavigation(editor, {
      isOpen: () => isOpen,
      moveUp: () => menuNavigator.moveUp(cardMenu.maxItemIndex),
      moveDown: () => menuNavigator.moveDown(cardMenu.maxItemIndex),
      selectedItem: () => menuNavigator.selectedItem(cardMenu.items),
      onSelect: (item) => {
        // insert from the flat item list — the same data CardMenu renders — so
        // selection never depends on the menu's DOM
        insert(item.insertCommand, item)
        trackEvent('Card Added', { card: item.label ?? 'unknown' })
      },
    })
  }, [editor, isSlash, isOpen, cardMenu, insert, menuNavigator])

  // button: arrows close the menu (leaving the cursor alone); Escape and
  // outside-mousedown are owned by the session
  React.useEffect(() => {
    if (isSlash || !isOpen) {
      return
    }
    return registerMenuArrowsClose({ isOpen: () => isOpen, close: closeMenu })
  }, [isSlash, isOpen, closeMenu])

  // reset the keyboard selection whenever the menu rebuilds
  React.useEffect(() => {
    menuNavigator.reset()
  }, [cardMenu, menuNavigator])

  // the navigator's scroll-request latch releases when the menu closes
  React.useEffect(() => {
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

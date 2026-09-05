import type { LexicalEditor, NodeKey } from 'lexical'

import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback, useContext, useId, useLayoutEffect, useRef, type RefObject } from 'react'

import type { PanelPosition, PanelSpacing, PanelViewport } from '@/utils/floating-panel'

import { createPanelDomWiring } from '@/utils/panel-resize-choreography'
import { createPanelSuppression } from '@/utils/panel-suppression'

// React adapter over the floating panel's headless modules
// (@/utils/floating-panel's layout math, @/utils/panel-drag-session's
// grab/listener choreography, @/utils/panel-resize-choreography's re-clamp
// resolutions AND its DOM assembly createPanelDomWiring, @/utils/panel-
// suppression's drag side effects): this hook keeps the refs (position
// state slots, viewport/card-width transition memory), the measurement
// closures (element/viewport/position read-write), and the effect triggers;
// every DOM consequence — body-level pointer listeners, the user-select
// stylesheet, click suppression, the ResizeObservers, the wide-card origin
// shift — lives in the wiring. Position and constraints go in, the committed
// position comes out as the element's transform. Replaces the former
// useMovable/useSettingsPanelReposition stack: both were single-consumer
// seams over this behaviour, and the drag session no longer captures its
// adjust callbacks mount-only, so the resolveCardElementRef dance is gone —
// every callback reads the latest resolver through the wiring ports.

interface UseFloatingPanelOptions {
  positionToRef?: RefObject<HTMLElement | null>
  cardKey?: NodeKey
  cardWidth: string
}

// Resolves the card's wrapper element from its node key. The wrapper inside the
// Lexical decorator element carries the card-width transform (e.g. wide cards),
// so it — not the decorator element — is the positioning anchor.
function findCardElement(editor: LexicalEditor, cardKey: NodeKey): HTMLElement | null {
  const decoratorElement = editor.getElementByKey(cardKey)
  if (!decoratorElement) {
    return null
  }
  return decoratorElement.querySelector('[data-inkling-card]') ?? decoratorElement
}

export default function useFloatingPanel<T extends HTMLElement = HTMLDivElement>({
  positionToRef,
  cardKey,
  cardWidth,
}: UseFloatingPanelOptions): { ref: RefObject<T | null> } {
  // read the raw context (null-safe) so the panel can still render outside a
  // composer (e.g. isolated unit tests) — useLexicalComposerContext would throw
  const composerContext = useContext(LexicalComposerContext)
  const editor = composerContext?.[0] ?? null

  const ref = useRef<T | null>(null)

  // currentX/Y start undefined (not 0) so the panel resize observer can
  // distinguish "never positioned" from a legitimate position on the (0,0) axes
  const currentX = useRef<number | undefined>(undefined)
  const currentY = useRef<number | undefined>(undefined)
  // spacing between the panel and the viewport at the last committed position,
  // so clamps can keep negative spacing when the user placed the panel offscreen
  const lastSpacing = useRef<PanelSpacing | null>(null)

  // the drag stylesheet id only needs document uniqueness — React's useId
  // supplies it without a module counter (replaces the ember-port guidFor shim)
  const stylesheetId = `inkling-floating-panel-drag-${useId()}`

  // transition-memory slots read by the wiring (viewport drift, wide-card
  // origin); cardWidth rides a ref so the wiring stays stable across width
  // changes — only the transition effect re-fires
  const previousViewport = useRef<PanelViewport>({ width: window.innerWidth, height: window.innerHeight })
  const previousCardWidth = useRef<string>(cardWidth)
  const previousCardOrigin = useRef<PanelPosition>({ x: 0, y: 0 })
  const cardWidthRef = useRef(cardWidth)
  useLayoutEffect(() => {
    cardWidthRef.current = cardWidth
  }, [cardWidth])

  // the card that renders the panel is the positioning anchor — resolve its
  // element from the node key (CardContext) instead of querying global DOM
  // selection attributes
  const resolveCardElement = useCallback((): HTMLElement | null => {
    if (positionToRef?.current) {
      return positionToRef.current
    }
    if (editor && cardKey) {
      return findCardElement(editor, cardKey)
    }
    return null
  }, [positionToRef, editor, cardKey])

  const getViewport = useCallback((): PanelViewport => {
    const adjustment = ref.current
      ? parseInt(window.getComputedStyle(ref.current).getPropertyValue('--inkling-breakout-adjustment') || '0', 10)
      : 0
    return { width: window.innerWidth - adjustment, height: window.innerHeight }
  }, [])

  const setPosition = useCallback(({ x, y }: PanelPosition) => {
    currentX.current = x
    currentY.current = y

    const elem = ref.current
    if (!elem) {
      return
    }

    lastSpacing.current = {
      top: y,
      left: x,
      right: window.innerWidth - x - elem.offsetWidth,
      bottom: window.innerHeight - y - elem.offsetHeight,
    }

    elem.style.transform = `translate(${x}px, ${y}px)`
  }, [])

  const getPosition = useCallback((): PanelPosition & { lastSpacing: PanelSpacing | null } => {
    return {
      x: currentX.current ?? 0,
      y: currentY.current ?? 0,
      lastSpacing: lastSpacing.current,
    }
  }, [])

  const getCommittedPosition = useCallback(() => {
    return {
      x: currentX.current,
      y: currentY.current,
      lastSpacing: lastSpacing.current,
    }
  }, [])

  // ref-reading ports lifted to useCallback so the effect that assembles the
  // wiring never touches a ref during render (the reads happen at call time)
  const getPanelElement = useCallback(() => ref.current, [])
  const isPanelElement = useCallback((element: unknown) => element === ref.current, [])
  const getCommittedCardWidth = useCallback(() => cardWidthRef.current, [])
  const isInteractiveElement = useCallback(
    (element: unknown) => element instanceof Element && element.matches('input, .ember-basic-dropdown-trigger'),
    [],
  )

  // the wiring (drag session + suppression + DOM assembly) is created in the
  // mount effect — matching the former session-in-effect pattern — and held in
  // a ref; the other effects trigger its methods, so the factory never runs
  // during render
  const wiringRef = useRef<ReturnType<typeof createPanelDomWiring> | null>(null)

  // mount: mark the panel draggable, then hand the DOM assembly the body
  // listeners, drag session, and ResizeObservers
  useLayoutEffect(() => {
    const suppression = createPanelSuppression({ getElement: getPanelElement, stylesheetId })
    const wiring = createPanelDomWiring({
      getElement: getPanelElement,
      resolveCardElement,
      getCommittedPosition,
      getPosition,
      setPosition,
      getViewport,
      getCardWidth: getCommittedCardWidth,
      previousCardWidth,
      previousCardOrigin,
      previousViewport,
      isPanel: isPanelElement,
      isInteractive: isInteractiveElement,
      suppression,
    })
    wiringRef.current = wiring

    const elem = ref.current
    if (!elem) {
      return
    }
    elem.setAttribute('draggable', 'true')
    elem.classList.add('inkling-card-movable')

    wiring.start()
    return () => {
      wiring.destroy()
    }
  }, [
    getPanelElement,
    stylesheetId,
    resolveCardElement,
    getCommittedPosition,
    getPosition,
    setPosition,
    getViewport,
    getCommittedCardWidth,
    isPanelElement,
    isInteractiveElement,
  ])

  // position on first render (and re-position if the card anchor changes)
  useLayoutEffect(() => {
    wiringRef.current?.placeInitial(ref.current)
  }, [wiringRef, resolveCardElement])

  // account for wide cards using a transform so we need to adjust the origin
  // position. previousCardWidth starts at cardWidth so the first render never
  // shifts the origin. The transition policy (origin re-base + settle clamp)
  // lives in @/utils/floating-panel's resolveCardWidthTransition; this effect
  // only re-fires it when the committed width changes.
  useLayoutEffect(() => {
    wiringRef.current?.applyCardWidthTransition()
  }, [wiringRef, cardWidth])

  return { ref }
}

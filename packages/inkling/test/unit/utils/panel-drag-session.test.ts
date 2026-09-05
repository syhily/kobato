import { describe, expect, it, vi } from 'vitest'

import type { PanelPosition } from '@/utils/floating-panel'

import {
  createPanelDragSession,
  resolvePanelGrabVerdict,
  type PanelDragActiveListeners,
} from '@/utils/panel-drag-session'

// the choreography is exercised synchronously through the ports: fake path
// elements stand in for the composed DOM path, the listenActive port captures
// the drag-lifetime listeners, and spies record the effect resolutions
function setup() {
  const panel = { name: 'panel' }
  const input = { name: 'input' }
  const effects = { activate: vi.fn(), deactivate: vi.fn() }
  const positions: PanelPosition[] = []
  let current: PanelPosition = { x: 100, y: 100 }
  const detach = vi.fn()
  const attached: { listeners: PanelDragActiveListeners | null } = { listeners: null }
  const listenActive = vi.fn((listeners: PanelDragActiveListeners) => {
    attached.listeners = listeners
    return detach
  })
  const session = createPanelDragSession({
    getPosition: () => current,
    setPosition: (position) => {
      current = position
      positions.push(position)
    },
    activateEffects: effects.activate,
    deactivateEffects: effects.deactivate,
    listenActive,
    isPanel: (element) => element === panel,
    isInteractive: (element) => element === input,
  })
  const listeners = () => {
    if (!attached.listeners) {
      throw new Error('expected the listenActive port to have been called')
    }
    return attached.listeners
  }
  return { session, effects, positions, detach, listenActive, listeners, panel, input }
}

describe('resolvePanelGrabVerdict', () => {
  const ports = {
    isPanel: (element: unknown) => element === 'panel',
    isInteractive: (element: unknown) => element === 'input',
  }

  it('returns panel when the path reaches the panel first', () => {
    expect(resolvePanelGrabVerdict(['child', 'panel', 'body'], ports)).toBe('panel')
  })

  it('returns interactive when an interactive element swallows the grab first', () => {
    expect(resolvePanelGrabVerdict(['input', 'panel', 'body'], ports)).toBe('interactive')
  })

  it('returns outside when the path contains neither', () => {
    expect(resolvePanelGrabVerdict(['elsewhere', 'body'], ports)).toBe('outside')
  })
})

describe('createPanelDragSession', () => {
  it('attaches the drag-lifetime listeners when the grab lands on the panel', () => {
    const { session, listenActive, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel, 'body'])

    expect(listenActive).toHaveBeenCalledTimes(1)
    expect(session.isDragging()).toBe(false)
  })

  it('ignores travel within the start threshold, then drags with the grab offset', () => {
    const { session, effects, positions, listeners, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel])
    listeners().move({ x: 113, y: 112 }) // within the 3px threshold
    expect(effects.activate).not.toHaveBeenCalled()
    expect(positions).toEqual([])

    listeners().move({ x: 120, y: 125 }) // threshold crossed → effects on, drag
    expect(effects.activate).toHaveBeenCalledTimes(1)
    expect(session.isDragging()).toBe(true)
    // grab offset 110-100 = 10 → position = pointer - offset
    expect(positions).toEqual([{ x: 110, y: 115 }])
  })

  it('never attaches listeners for a grab on an interactive child or outside the panel', () => {
    const { session, listenActive, panel, input } = setup()

    session.grab({ x: 110, y: 110 }, [input, panel])
    expect(listenActive).not.toHaveBeenCalled()

    session.grab({ x: 110, y: 110 }, ['elsewhere'])
    expect(listenActive).not.toHaveBeenCalled()
    expect(session.isDragging()).toBe(false)
  })

  it('detaches the listeners and unwinds the effects on release, even when never dragged', () => {
    const { session, effects, detach, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel])
    session.release()

    expect(detach).toHaveBeenCalledTimes(1)
    expect(effects.deactivate).toHaveBeenCalledTimes(1)
    expect(session.isDragging()).toBe(false)
  })

  it('ends the drag through the active end listener (detach before the effects unwind)', () => {
    const { session, effects, detach, listeners, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel])
    listeners().move({ x: 120, y: 125 })
    listeners().end()

    expect(detach).toHaveBeenCalledTimes(1)
    expect(effects.deactivate).toHaveBeenCalledTimes(1)
    expect(session.isDragging()).toBe(false)

    // a further release is inert — the listeners are already detached
    session.release()
    expect(detach).toHaveBeenCalledTimes(1)
  })

  it('reuses the still-attached listeners for a second grab', () => {
    const { session, listenActive, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel])
    session.grab({ x: 130, y: 130 }, [panel])

    expect(listenActive).toHaveBeenCalledTimes(1)
  })

  it('shifts the grab offset so a mid-drag re-clamp does not jump the position', () => {
    const { session, positions, listeners, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel])
    session.adjustOffset(5, 0)
    listeners().move({ x: 120, y: 110 })

    // offset 110-100-5 = 5 → position = 120 - 5
    expect(positions).toEqual([{ x: 115, y: 100 }])
  })

  it('destroy detaches the listeners without unwinding the effects', () => {
    const { session, effects, detach, panel } = setup()

    session.grab({ x: 110, y: 110 }, [panel])
    session.destroy()

    expect(detach).toHaveBeenCalledTimes(1)
    expect(effects.deactivate).not.toHaveBeenCalled()
  })
})

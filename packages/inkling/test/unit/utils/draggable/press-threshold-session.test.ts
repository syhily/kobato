import { describe, expect, it, vi } from 'vitest'

import { createPressThresholdSession, type PressThresholdPoint } from '@/utils/draggable/press-threshold-session'

const THRESHOLD = 3

function setup(grab: PressThresholdPoint = { x: 10, y: 10 }) {
  const onBegin = vi.fn()
  const onCancel = vi.fn()
  const session = createPressThresholdSession(grab, { threshold: THRESHOLD, onBegin, onCancel })
  return { session, onBegin, onCancel }
}

describe('createPressThresholdSession', () => {
  it('ignores pointer travel within the threshold', () => {
    const { session, onBegin } = setup()

    // exactly at the threshold is not a crossing
    session.move({ x: 10 + THRESHOLD, y: 10 })
    expect(onBegin).not.toHaveBeenCalled()
    expect(session.isPending()).toBe(true)
  })

  it('begins the press once pointer travel crosses the threshold', () => {
    const { session, onBegin, onCancel } = setup()

    session.move({ x: 10 + THRESHOLD + 1, y: 10 })

    expect(onBegin).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(session.isPending()).toBe(false)
  })

  it('crosses the threshold on either axis', () => {
    const { session, onBegin } = setup()

    session.move({ x: 10, y: 10 - THRESHOLD - 1 })

    expect(onBegin).toHaveBeenCalledTimes(1)
  })

  it('measures travel from the grab point, not the previous move', () => {
    const { session, onBegin } = setup()

    session.move({ x: 10, y: 10 })
    expect(onBegin).not.toHaveBeenCalled()

    session.move({ x: 10 + THRESHOLD + 1, y: 10 })
    expect(onBegin).toHaveBeenCalledTimes(1)
  })

  it('resolves exactly once — moves after the begin are inert', () => {
    const { session, onBegin, onCancel } = setup()

    session.move({ x: 20, y: 20 })
    session.move({ x: 30, y: 30 })
    session.cancel()

    expect(onBegin).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels when the press ends before the threshold', () => {
    const { session, onBegin, onCancel } = setup()

    session.cancel()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onBegin).not.toHaveBeenCalled()
    expect(session.isPending()).toBe(false)

    // the session is finished — a later move is inert
    session.move({ x: 100, y: 100 })
    expect(onBegin).not.toHaveBeenCalled()
  })

  it('cancel is idempotent', () => {
    const { session, onCancel } = setup()

    session.cancel()
    session.cancel()

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('works without an onCancel port', () => {
    const onBegin = vi.fn()
    const session = createPressThresholdSession({ x: 0, y: 0 }, { threshold: THRESHOLD, onBegin })

    expect(() => session.cancel()).not.toThrow()
    expect(onBegin).not.toHaveBeenCalled()
  })
})

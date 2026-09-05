import { afterEach, describe, expect, it } from 'vitest'

import { createPanelSuppression, type PanelSuppression } from '@/utils/panel-suppression'

function makePanel(): { panel: HTMLElement; suppression: PanelSuppression } {
  const panel = document.createElement('div')
  panel.style.overflow = 'scroll'
  document.body.appendChild(panel)
  const suppression = createPanelSuppression({ getElement: () => panel, stylesheetId: 'test-suppression-stylesheet' })
  return { panel, suppression }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.getElementById('test-suppression-stylesheet')?.remove()
})

describe('createPanelSuppression', () => {
  it('locks scroll/selection/pointer-events on activate and restores them on deactivate', async () => {
    const { panel, suppression } = makePanel()

    suppression.activate()

    expect(panel.style.overflow).toBe('hidden')
    expect(panel.style.pointerEvents).toBe('none')
    expect(document.getElementById('test-suppression-stylesheet')).not.toBeNull()

    suppression.deactivate()

    // the click capture and pointer-events restores are deferred a few ms
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10)
    })

    expect(panel.style.overflow).toBe('scroll')
    expect(panel.style.pointerEvents).toBe('')
    expect(document.getElementById('test-suppression-stylesheet')).toBeNull()
  })

  it('swallows clicks while active and stops doing so after deactivate', async () => {
    const { panel, suppression } = makePanel()
    const captured: Event[] = []
    document.body.addEventListener('click', (e) => captured.push(e))

    suppression.activate()
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(captured).toHaveLength(0)

    suppression.deactivate()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10)
    })
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(captured).toHaveLength(1)
  })

  it('is null-safe when the panel unmounts mid-drag', () => {
    const suppression = createPanelSuppression({ getElement: () => null, stylesheetId: 'test-2' })

    expect(() => {
      suppression.activate()
      suppression.deactivate()
    }).not.toThrow()
  })
})

// The observability settings cards are the only SettingsRow consumers of
// labelTooltip; this journey proves the portal tooltip actually renders (and
// paints above the fixed z-50 settings panel) when its trigger is hovered.

import { expect, test } from './support/fixtures'
import { openSettings } from './support/journey'

const HINT_TRIGGER_LABEL = '了解更多' // admin.settings.shared.hintTooltip (zh-CN)
const OBSERVABILITY_NAV_LABEL = '可观测性' // admin.settings.section.observability.label

interface TooltipProbe {
  hitInsidePopup: boolean
  hitDescription: string
  hitText: string | null
  hitStack: string[]
  popupRect: string
  hitChain: Array<{ tag: string; id: string; classes: string; zIndex: string; position: string }>
  rootLayers: Array<{ tag: string; id: string; classes: string; zIndex: string; position: string; onTop: boolean }>
  popup: { zIndex: string; position: string; backgroundColor: string; transform: string; color: string }
  ancestors: Array<{ tag: string; id: string; classes: string; zIndex: string; position: string }>
}

function probeTooltip(popup: HTMLElement): TooltipProbe {
  const rect = popup.getBoundingClientRect()
  // The tooltip carries `pointer-events-none` by design (hover must flow
  // through it), which would make elementFromPoint skip it entirely. Override
  // inline just for the probe so hit-testing follows paint order for the popup.
  const restorePointerEvents = popup.style.pointerEvents
  popup.style.pointerEvents = 'auto'
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  popup.style.pointerEvents = restorePointerEvents
  const hitInsidePopup = hit !== null && (hit === popup || popup.contains(hit))
  const stack = document
    .elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    .slice(0, 6)
    .map((el) => {
      if (!(el instanceof HTMLElement)) {
        return `<${el.tagName.toLowerCase()}>`
      }
      const r = el.getBoundingClientRect()
      return `<${el.tagName.toLowerCase()} class="${typeof el.className === 'string' ? el.className.slice(0, 120) : ''}" rect="${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}">`
    })
  const chain = (
    el: Element | null,
  ): Array<{ tag: string; id: string; classes: string; zIndex: string; position: string }> => {
    const out: TooltipProbe['hitChain'] = []
    let node: HTMLElement | null = el instanceof HTMLElement ? el : null
    while (node !== null && node !== document.documentElement) {
      const styles = getComputedStyle(node)
      out.push({
        tag: node.tagName.toLowerCase(),
        id: node.id,
        classes: typeof node.className === 'string' ? node.className : '',
        zIndex: styles.zIndex,
        position: styles.position,
      })
      node = node.parentElement
    }
    return out
  }
  const describe = (el: Element | null): string =>
    el === null
      ? 'null'
      : `<${el.tagName.toLowerCase()} class="${typeof el.className === 'string' ? el.className : ''}">`
  const rootLayers: TooltipProbe['rootLayers'] = []
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement)) {
      continue
    }
    const styles = getComputedStyle(node)
    const nodeRect = node.getBoundingClientRect()
    const overlaps =
      nodeRect.left <= rect.right &&
      nodeRect.right >= rect.left &&
      nodeRect.top <= rect.bottom &&
      nodeRect.bottom >= rect.top
    if ((styles.zIndex !== 'auto' || styles.position !== 'static') && overlaps) {
      const centerHit = document.elementFromPoint(
        (Math.max(nodeRect.left, rect.left) + Math.min(nodeRect.right, rect.right)) / 2,
        (Math.max(nodeRect.top, rect.top) + Math.min(nodeRect.bottom, rect.bottom)) / 2,
      )
      rootLayers.push({
        tag: node.tagName.toLowerCase(),
        id: node.id,
        classes: typeof node.className === 'string' ? node.className : '',
        zIndex: styles.zIndex,
        position: styles.position,
        onTop: centerHit !== null && (centerHit === node || node.contains(centerHit)),
      })
    }
  }
  const styles = getComputedStyle(popup)
  return {
    hitInsidePopup,
    hitDescription: describe(hit),
    hitText: hit?.textContent?.slice(0, 60) ?? null,
    hitStack: stack,
    popupRect: `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
    hitChain: chain(hit),
    rootLayers,
    popup: {
      zIndex: styles.zIndex,
      position: styles.position,
      backgroundColor: styles.backgroundColor,
      transform: styles.transform,
      color: styles.color,
    },
    ancestors: chain(popup),
  }
}

test('observability hint tooltip opens above the fixed settings panel', async ({ adminPage: page }) => {
  await openSettings(page)
  await page.locator('aside').getByRole('button', { name: OBSERVABILITY_NAV_LABEL, exact: true }).click()

  const trigger = page.getByRole('button', { name: HINT_TRIGGER_LABEL, exact: true }).first()
  await expect(trigger).toBeVisible()
  await trigger.hover()

  // Base UI renders Positioner > Popup; the popup is the last data-open element.
  const popup = page.locator('div[data-open]').last()
  await expect(popup).toBeVisible()
  const probe = await popup.evaluate(probeTooltip)

  const clip = await popup.boundingBox()
  if (clip === null) {
    throw new Error('popup bounding box disappeared before the pixel check')
  }
  const openShot = await page.screenshot({ path: 'tmp/obs-tooltip-open.png', clip })
  await page.mouse.move(8, 8)
  await expect(popup).toBeHidden()
  const closedShot = await page.screenshot({ clip })

  expect(probe.hitInsidePopup, `tooltip is covered by another layer: ${JSON.stringify(probe)}`).toBe(true)
  expect(openShot.equals(closedShot), 'opening the tooltip must change the pixels inside its bounds').toBe(false)
})

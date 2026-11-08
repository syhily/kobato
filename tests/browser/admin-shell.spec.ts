import { expect, test } from './support/fixtures'
import { waitForHydration } from './support/journey'

test('aligns the sidebar brand, search trigger, and active menu edges', async ({ adminPage }) => {
  await adminPage.goto('/admin')

  const header = adminPage.locator('[data-slot="sidebar-header"]')
  const logo = header.locator('img').first()
  const search = header.locator('button[aria-haspopup="dialog"]')
  const activeMenu = adminPage.locator('[data-slot="sidebar-menu-button"][data-active="true"]').first()

  await expect(logo).toBeVisible()
  await expect(search).toBeVisible()
  await expect(activeMenu).toBeVisible()

  // Measure in-page in one shot and poll until all three boxes are visible:
  // the post-hydration re-render can replace the SSR sidebar nodes in the gap
  // between Playwright's visibility check and a locator boundingBox() call,
  // which then comes back null (see replaceInput's comment in support/journey).
  const boxesHandle = await adminPage.waitForFunction(
    () => {
      const rect = (element: Element | null | undefined) => {
        if (!element) {
          return null
        }
        const box = element.getBoundingClientRect()
        if (box.width === 0 || box.height === 0 || getComputedStyle(element).visibility === 'hidden') {
          return null
        }
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      }
      const header = document.querySelector('[data-slot="sidebar-header"]')
      const logoBox = rect(header?.querySelector('img'))
      const searchBox = rect(header?.querySelector('button[aria-haspopup="dialog"]'))
      const activeMenuBox = rect(document.querySelector('[data-slot="sidebar-menu-button"][data-active="true"]'))
      return logoBox !== null && searchBox !== null && activeMenuBox !== null
        ? { logoBox, searchBox, activeMenuBox }
        : null
    },
    undefined,
    { timeout: 10_000 },
  )
  // waitForFunction resolves only on a truthy value, so the null poll is gone here.
  const { logoBox, searchBox, activeMenuBox } = (await boxesHandle.jsonValue()) as NonNullable<
    Awaited<ReturnType<typeof boxesHandle.jsonValue>>
  >

  expect({
    logoLeft: logoBox.x,
    searchLeft: searchBox.x,
    searchRight: searchBox.x + searchBox.width,
  }).toEqual({
    logoLeft: activeMenuBox.x,
    searchLeft: activeMenuBox.x,
    searchRight: activeMenuBox.x + activeMenuBox.width,
  })

  await adminPage.screenshot({ path: test.info().outputPath('admin-sidebar-alignment.png') })
})

test('uses one control size across the posts toolbar', async ({ adminPage }) => {
  await adminPage.goto('/admin/posts')
  await waitForHydration(adminPage, '[data-slot="select-trigger"]')

  const filter = adminPage.getByRole('button', { name: '筛选', exact: true })
  const sort = adminPage.locator('[data-slot="select-trigger"]')
  const create = adminPage.getByRole('link', { name: '新建文章', exact: true })
  const controls = [filter, sort, create]

  for (const control of controls) {
    await expect(control).toBeVisible()
  }

  const styles = await Promise.all(
    controls.map(async (control) => {
      const box = await control.boundingBox()
      if (box === null) {
        throw new Error('toolbar control has no visible rectangle')
      }
      const style = await control.evaluate((element) => {
        const computed = getComputedStyle(element)
        const icon = element.querySelector('svg')
        return {
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          paddingLeft: computed.paddingLeft,
          paddingRight: computed.paddingRight,
          gap: computed.gap,
          borderRadius: computed.borderRadius,
          iconWidth: icon === null ? null : getComputedStyle(icon).width,
          iconHeight: icon === null ? null : getComputedStyle(icon).height,
        }
      })
      return Object.assign(style, { height: box.height })
    }),
  )

  expect(styles[1]).toEqual(styles[0])
  expect(styles[2]).toEqual(styles[0])
  await adminPage.screenshot({ path: test.info().outputPath('admin-posts-toolbar-controls.png') })
})

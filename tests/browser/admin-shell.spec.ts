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

  const [logoBox, searchBox, activeMenuBox] = await Promise.all([
    logo.boundingBox(),
    search.boundingBox(),
    activeMenu.boundingBox(),
  ])
  if (logoBox === null || searchBox === null || activeMenuBox === null) {
    throw new Error('sidebar alignment requires visible logo, search, and active menu rectangles')
  }

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

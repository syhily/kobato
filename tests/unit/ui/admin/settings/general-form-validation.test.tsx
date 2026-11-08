// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import { GeneralForm } from '@/ui/admin/settings/GeneralForm'

const siteIdentity = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!

function renderForm(locale: 'en-US' | 'zh-CN' | 'zh-TW') {
  return render(wrapWithI18n(<GeneralForm siteIdentity={siteIdentity} timeZones={['Asia/Shanghai']} />, { locale }))
}

const EXPECTED = {
  'en-US': 'Enter a site title',
  'zh-CN': '请填写站点标题',
  'zh-TW': '請填寫網站標題',
} as const

/** Clearing the title trips the client-only schema; the message must be translated. */
async function clearTitleAndReadError(locale: keyof typeof EXPECTED): Promise<string> {
  renderForm(locale)
  const input = document.getElementById('general-title') as HTMLInputElement | null
  expect(input).not.toBeNull()
  fireEvent.change(input!, { target: { value: '' } })
  await screen.findAllByText(EXPECTED[locale])
  expect(document.body.textContent).not.toContain('admin.settings.validation.titleRequired')
  return document.body.textContent ?? ''
}

describe('GeneralForm client validation messages', () => {
  it('localizes the zod message for zh-CN, keeping the field path intact', async () => {
    const text = await clearTitleAndReadError('zh-CN')
    expect(text).toContain('请填写站点标题')
    expect(text).not.toContain('admin.settings.validation')
  })

  it('localizes the same message for en-US', async () => {
    const text = await clearTitleAndReadError('en-US')
    expect(text).toContain('Enter a site title')
    expect(text).not.toContain('admin.settings.validation')
  })

  it('localizes for zh-TW from the Traditional catalog', async () => {
    const text = await clearTitleAndReadError('zh-TW')
    expect(text).toContain('請填寫網站標題')
    expect(text).not.toContain('admin.settings.validation')
  })
})

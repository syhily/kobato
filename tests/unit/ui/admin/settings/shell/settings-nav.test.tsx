// @vitest-environment happy-dom

import { screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'

import type { SettingsSection } from '@/shared/config/sections'
import type { AppLocale } from '@/shared/i18n/locales'

import { makeTranslator } from '#/_helpers/i18n'
import { renderWithI18n, wrapWithI18n } from '#/_helpers/i18n-render'
import { SECTION_DISPLAY } from '@/shared/config/display'
import { SettingsNav } from '@/ui/admin/settings/shell/SettingsNav'
import { SettingsSearchInput } from '@/ui/admin/settings/shell/SettingsSearchInput'
import {
  SettingsSearchProvider,
  useSettingsSearch,
  useSettingsSearchFilter,
} from '@/ui/admin/settings/shell/useSettingsSearch'

const SECTIONS: readonly SettingsSection[] = ['general', 'assets', 'fonts']

function navItems(locale: AppLocale) {
  const t = makeTranslator(locale)
  return SECTIONS.map((id) => ({
    id,
    label: t(SECTION_DISPLAY[id].labelId),
    icon: SECTION_DISPLAY[id].icon,
    group: SECTION_DISPLAY[id].group,
    keywords: [t(SECTION_DISPLAY[id].labelId), t(SECTION_DISPLAY[id].descriptionId), id],
  }))
}

function renderNav(locale: AppLocale) {
  return renderWithI18n(
    <SettingsSearchProvider>
      <SettingsSearchInput />
      <SettingsNav items={navItems(locale)} />
    </SettingsSearchProvider>,
    { locale },
  )
}

function SearchHarness({ filter, noResult }: { filter?: string; noResult?: boolean }) {
  const { setFilter } = useSettingsSearchFilter()
  const { setNoResult } = useSettingsSearch()
  useEffect(() => {
    if (filter !== undefined) {
      setFilter(filter)
    }
    if (noResult === true) {
      setNoResult(true)
    }
  }, [filter, noResult, setFilter, setNoResult])
  return null
}

describe('ui/admin/settings/shell/SettingsNav i18n', () => {
  it('renders the zh-CN group heading, section labels and search placeholder', () => {
    renderNav('zh-CN')

    expect(screen.getByRole('heading', { name: '站点' })).toBeTruthy()
    expect(screen.getByText('基本信息')).toBeTruthy()
    expect(screen.getByText('存储配置')).toBeTruthy()
    expect(screen.getByText('字体配置')).toBeTruthy()
    expect(screen.getByPlaceholderText('搜索设置…')).toBeTruthy()
  })

  it('renders the en-US group heading, section labels and search placeholder', () => {
    renderNav('en-US')

    expect(screen.getByRole('heading', { name: 'Site' })).toBeTruthy()
    expect(screen.getByText('Basic info')).toBeTruthy()
    expect(screen.getByText('Storage settings')).toBeTruthy()
    expect(screen.getByText('Font settings')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search settings…')).toBeTruthy()
  })

  it('filters nav items by the section id in both locales', () => {
    const zh = renderNav('zh-CN')
    zh.rerender(
      wrapWithI18n(
        <SettingsSearchProvider>
          <SearchHarness filter="fonts" />
          <SettingsNav items={navItems('zh-CN')} />
        </SettingsSearchProvider>,
        { locale: 'zh-CN' },
      ),
    )
    expect(screen.queryByText('基本信息')).toBeNull()
    expect(screen.getByText('字体配置')).toBeTruthy()

    zh.unmount()

    const en = renderNav('en-US')
    en.rerender(
      wrapWithI18n(
        <SettingsSearchProvider>
          <SearchHarness filter="fonts" />
          <SettingsNav items={navItems('en-US')} />
        </SettingsSearchProvider>,
        { locale: 'en-US' },
      ),
    )
    expect(screen.queryByText('Basic info')).toBeNull()
    expect(screen.getByText('Font settings')).toBeTruthy()
  })

  it('renders the localized no-results copy', () => {
    renderWithI18n(
      <SettingsSearchProvider>
        <SearchHarness noResult />
        <SettingsNav items={navItems('zh-CN')} />
      </SettingsSearchProvider>,
      { locale: 'zh-CN' },
    )
    expect(screen.getByText('未找到匹配的设置')).toBeTruthy()

    renderWithI18n(
      <SettingsSearchProvider>
        <SearchHarness noResult />
        <SettingsNav items={navItems('en-US')} />
      </SettingsSearchProvider>,
      { locale: 'en-US' },
    )
    expect(screen.getByText('No matching settings')).toBeTruthy()
  })
})

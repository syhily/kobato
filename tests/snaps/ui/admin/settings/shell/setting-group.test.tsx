import { describe, expect, it } from 'vitest'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { SettingGroup } from '@/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/admin/settings/shell/SettingGroupContent'
import { SettingsCloseButton } from '@/ui/admin/settings/shell/SettingsHeader'
import { SettingsMobileBar } from '@/ui/admin/settings/shell/SettingsMobileBar'
import { SettingsNav } from '@/ui/admin/settings/shell/SettingsNav'
import { SettingsPanel } from '@/ui/admin/settings/shell/SettingsPanel'
import { SettingsSearchInput } from '@/ui/admin/settings/shell/SettingsSearchInput'
import { useSettingsCard } from '@/ui/admin/settings/shell/useSettingsCard'
import { ScrollSpyProvider } from '@/ui/admin/settings/shell/useSettingsScrollSpy'
import { SettingsSearchProvider } from '@/ui/admin/settings/shell/useSettingsSearch'
import { Input } from '@/ui/components/input'

describe('snapshot: SettingGroup', () => {
  it('renders a group with title and description', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingGroup title="基本信息" description="站点标题、描述等。">
          <p>内容</p>
        </SettingGroup>,
      ),
    )
    expect(html).toContain('基本信息')
    expect(html).toContain('站点标题、描述等')
    expect(html).toContain('内容')
  })

  it('renders a saving state', () => {
    const html = stableHtml(renderToHtml(<SettingGroup title="保存中" saveState="saving" />))
    expect(html).toContain('保存中')
  })

  it('renders a saved state', () => {
    const html = stableHtml(renderToHtml(<SettingGroup title="已保存" saveState="saved" />))
    expect(html).toContain('已保存')
    expect(html).toContain('已保存')
  })

  it('renders actions', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingGroup title="操作" actions={<button type="button">编辑</button>}>
          <p>内容</p>
        </SettingGroup>,
      ),
    )
    expect(html).toContain('操作')
    expect(html).toContain('编辑')
  })
})

describe('snapshot: SettingGroupContent', () => {
  it('wraps children with vertical spacing', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingGroupContent>
          <p>A</p>
          <p>B</p>
        </SettingGroupContent>,
      ),
    )
    expect(html).toContain('A')
    expect(html).toContain('B')
  })
})

describe('snapshot: SettingsCloseButton', () => {
  it('renders the close button', () => {
    const html = stableHtml(renderInRouter(<SettingsCloseButton />))
    expect(html).toContain('关闭')
    expect(html).toContain('type="button"')
  })
})

describe('snapshot: SettingsPanel', () => {
  it('renders the fullscreen panel shell', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsPanel>
          <div>panel content</div>
        </SettingsPanel>,
      ),
    )
    expect(html).toContain('panel content')
    expect(html).toContain('fixed inset-0')
  })
})

describe('snapshot: SettingsSearchInput', () => {
  it('renders the search input', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsSearchProvider>
          <SettingsSearchInput />
        </SettingsSearchProvider>,
      ),
    )
    expect(html).toContain('搜索设置')
    expect(html).toContain('type="text"')
  })
})

describe('snapshot: SettingsMobileBar', () => {
  it('renders the mobile search bar', () => {
    const html = stableHtml(
      renderInRouter(
        <SettingsSearchProvider>
          <SettingsMobileBar />
        </SettingsSearchProvider>,
      ),
    )
    expect(html).toContain('搜索设置')
    expect(html).toContain('type="text"')
  })
})

describe('snapshot: SettingsNav', () => {
  const items = [
    {
      id: 'general' as const,
      label: '基本信息',
      icon: 'Settings',
      group: 'site' as const,
      keywords: ['title', 'description'],
    },
    {
      id: 'content' as const,
      label: '内容与分页',
      icon: 'FileText',
      group: 'content' as const,
      keywords: ['pagination'],
    },
    {
      id: 'mail' as const,
      label: '邮件服务',
      icon: 'Mail',
      group: 'service' as const,
      keywords: ['smtp', 'zeabur'],
    },
    {
      id: 'cache' as const,
      label: '缓存管理',
      icon: 'Database',
      group: 'system' as const,
      keywords: ['kv'],
    },
  ]

  it('renders grouped navigation items', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsSearchProvider>
          <ScrollSpyProvider>
            <SettingsNav items={items} />
          </ScrollSpyProvider>
        </SettingsSearchProvider>,
      ),
    )
    expect(html).toContain('站点')
    expect(html).toContain('基本信息')
    expect(html).toContain('内容与展示')
    expect(html).toContain('服务集成')
    expect(html).toContain('系统运维')
  })
})

describe('snapshot: useSettingsCard', () => {
  interface Source {
    title: string
  }
  interface State {
    title: string
  }

  function TestCard() {
    const { form, display, settingGroupProps } = useSettingsCard<Source, State>({
      section: 'general',
      source: { title: 'Hello' },
      toState: (s) => ({ title: s.title }),
      fromState: (state) => ({ title: state.title }),
    })

    return (
      <SettingGroup title="测试卡片" saveState={settingGroupProps.saveState}>
        <Input {...form.register('title')} />
        <span>display:{display.title}</span>
      </SettingGroup>
    )
  }

  it('renders a card using the hook', () => {
    const html = stableHtml(renderToHtml(<TestCard />))
    expect(html).toContain('测试卡片')
    expect(html).toContain('Hello')
  })
})

import { describe, expect, it } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { SettingsRow } from '@/ui/admin/settings/SettingsSection'
import { Input } from '@/ui/components/input'

describe('snapshot: SettingsRow', () => {
  it('renders a basic label + control row', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsRow label="站点标题" htmlFor="site-title" hint="显示在浏览器标签与首页标题处。">
          <Input id="site-title" defaultValue="且听书吟" />
        </SettingsRow>,
      ),
    )
    expect(html).toContain('站点标题')
    expect(html).toContain('site-title')
    expect(html).toContain('显示在浏览器标签与首页标题处')
    expect(html).toContain('且听书吟')
  })

  it('renders an error state', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsRow label="邮箱" error="请输入有效的邮箱地址。">
          <Input defaultValue="not-an-email" />
        </SettingsRow>,
      ),
    )
    expect(html).toContain('邮箱')
    expect(html).toContain('请输入有效的邮箱地址')
    expect(html).toContain('data-invalid="true"')
  })

  it('supports render-prop control props', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsRow label="昵称" hint="2-20 个字符。">
          {(controlProps) => (
            <Input aria-invalid={controlProps['aria-invalid']} aria-describedby={controlProps['aria-describedby']} />
          )}
        </SettingsRow>,
      ),
    )
    expect(html).toContain('昵称')
    expect(html).toContain('2-20 个字符')
  })
})
